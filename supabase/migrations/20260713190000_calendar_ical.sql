-- Public family iCal feed support and read-only external calendar imports.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- La funcion publica genera el feed con service_role sin cambiar las politicas actuales.
do $$
begin
  if to_regclass('public.reservations') is not null then
    grant select on public.reservations to service_role;
  end if;
end;
$$;

create table if not exists public.external_calendar_events (
  source text not null check (source in ('airbnb', 'booking')),
  external_uid text not null,
  start_date date not null,
  end_date date not null,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source, external_uid),
  constraint external_calendar_events_dates_chk check (end_date > start_date)
);

create index if not exists external_calendar_events_dates_idx
  on public.external_calendar_events (start_date, end_date);

create table if not exists public.calendar_sync_status (
  source text primary key check (source in ('airbnb', 'booking')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'ok', 'error')),
  event_count integer not null default 0 check (event_count >= 0),
  error_message text
);

insert into public.calendar_sync_status (source)
values ('airbnb'), ('booking')
on conflict (source) do nothing;

alter table public.external_calendar_events enable row level security;
alter table public.calendar_sync_status enable row level security;

drop policy if exists "external calendar events public read" on public.external_calendar_events;
create policy "external calendar events public read"
  on public.external_calendar_events for select
  to anon, authenticated
  using (true);

drop policy if exists "calendar sync status public read" on public.calendar_sync_status;
create policy "calendar sync status public read"
  on public.calendar_sync_status for select
  to anon, authenticated
  using (true);

grant select on public.external_calendar_events to anon, authenticated;
grant select on public.calendar_sync_status to anon, authenticated;
revoke insert, update, delete, truncate on public.external_calendar_events from anon, authenticated;
revoke insert, update, delete, truncate on public.calendar_sync_status from anon, authenticated;

create or replace function public.replace_external_calendar_events(
  p_source text,
  p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer;
begin
  if p_source not in ('airbnb', 'booking') then
    raise exception 'Invalid calendar source';
  end if;

  if jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'Events must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_events) as event(
      external_uid text,
      start_date date,
      end_date date
    )
    where event.external_uid is null
       or event.external_uid = ''
       or event.start_date is null
       or event.end_date is null
       or event.end_date <= event.start_date
  ) then
    raise exception 'One or more imported events are invalid';
  end if;

  delete from public.external_calendar_events where source = p_source;

  insert into public.external_calendar_events (
    source,
    external_uid,
    start_date,
    end_date,
    last_seen_at,
    updated_at
  )
  select
    p_source,
    event.external_uid,
    event.start_date,
    event.end_date,
    now(),
    now()
  from (
    select distinct on (parsed.external_uid)
      parsed.external_uid,
      parsed.start_date,
      parsed.end_date
    from jsonb_to_recordset(p_events) as parsed(
      external_uid text,
      start_date date,
      end_date date
    )
    order by parsed.external_uid, parsed.start_date, parsed.end_date
  ) as event;

  get diagnostics inserted_count = row_count;

  insert into public.calendar_sync_status (
    source,
    last_attempt_at,
    last_success_at,
    status,
    event_count,
    error_message
  ) values (
    p_source,
    now(),
    now(),
    'ok',
    inserted_count,
    null
  )
  on conflict (source) do update set
    last_attempt_at = excluded.last_attempt_at,
    last_success_at = excluded.last_success_at,
    status = excluded.status,
    event_count = excluded.event_count,
    error_message = null;

  return inserted_count;
end;
$$;

revoke all on function public.replace_external_calendar_events(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_external_calendar_events(text, jsonb) to service_role;

create or replace function public.record_calendar_sync_error(
  p_source text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_source not in ('airbnb', 'booking') then
    raise exception 'Invalid calendar source';
  end if;

  insert into public.calendar_sync_status (
    source,
    last_attempt_at,
    status,
    error_message
  ) values (
    p_source,
    now(),
    'error',
    left(coalesce(p_error_message, 'Error de sincronizacion'), 240)
  )
  on conflict (source) do update set
    last_attempt_at = excluded.last_attempt_at,
    status = excluded.status,
    error_message = excluded.error_message;
end;
$$;

revoke all on function public.record_calendar_sync_error(text, text) from public, anon, authenticated;
grant execute on function public.record_calendar_sync_error(text, text) to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'external_calendar_events'
  ) then
    alter publication supabase_realtime add table public.external_calendar_events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_sync_status'
  ) then
    alter publication supabase_realtime add table public.calendar_sync_status;
  end if;
end;
$$;

-- The cron calls the public Edge Function with a secret held in Supabase Vault.
-- Deployment creates the calendar_sync_secret entry before this job first runs.
create or replace function public.invoke_calendar_ical_sync()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sync_secret text;
  request_id bigint;
begin
  select decrypted_secret
  into sync_secret
  from vault.decrypted_secrets
  where name = 'calendar_sync_secret'
  order by created_at desc
  limit 1;

  if sync_secret is null or sync_secret = '' then
    raise exception 'Vault secret calendar_sync_secret is not configured';
  end if;

  select net.http_post(
    url := 'https://uimqusoylxpyljbfqumm.supabase.co/functions/v1/calendar-ical/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', sync_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_calendar_ical_sync() from public, anon, authenticated;
grant execute on function public.invoke_calendar_ical_sync() to postgres, service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'calendar-ical-sync-15m';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'calendar-ical-sync-15m',
    '*/15 * * * *',
    'select public.invoke_calendar_ical_sync();'
  );
end;
$$;
