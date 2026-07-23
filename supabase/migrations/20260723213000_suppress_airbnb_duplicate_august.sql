-- The valid stay is the family reservation 2026-08-01 -> 2026-08-02.
-- Airbnb re-exported the old manual block as 2026-08-02 -> 2026-08-03.
-- Keep a durable, UID-scoped suppression so the mirror cannot return on cron.

create table if not exists public.external_calendar_event_suppressions (
  source text not null check (source in ('airbnb', 'booking')),
  external_uid text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (source, external_uid)
);

alter table public.external_calendar_event_suppressions enable row level security;
revoke all on public.external_calendar_event_suppressions from public, anon, authenticated;
grant select, insert, update, delete on public.external_calendar_event_suppressions to service_role;

insert into public.external_calendar_event_suppressions (source, external_uid, reason)
values (
  'airbnb',
  'airbnb:fbe3ed52e096326745adb8238ccad56ac1757d0a985234adfce07987ae25711e',
  'Mirror obsoleto del bloqueo manual: la reserva válida es particular 2026-08-01 a 2026-08-02'
)
on conflict (source, external_uid) do update set reason = excluded.reason;

delete from public.external_calendar_events
where source = 'airbnb'
  and external_uid = 'airbnb:fbe3ed52e096326745adb8238ccad56ac1757d0a985234adfce07987ae25711e';

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
  ) as event
  where not exists (
    select 1
    from public.external_calendar_event_suppressions suppression
    where suppression.source = p_source
      and suppression.external_uid = event.external_uid
  );

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

revoke all on function public.replace_external_calendar_events(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_external_calendar_events(text, jsonb)
  to service_role;
