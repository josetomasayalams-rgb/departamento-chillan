-- Shared backend migration. Run first in a staging project, inspect the conflict
-- report, then apply in production before closing direct browser writes.
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

alter table reservations add column if not exists needs_resolution boolean not null default false;
alter table rentals add column if not exists needs_resolution boolean not null default false;
create table if not exists calendar_pin_attempts (
  scope text not null,
  client_key text not null,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  primary key (scope, client_key)
);
alter table calendar_pin_attempts enable row level security;

-- Keep historical overlaps, make them explicit, and let the API prevent every
-- future clash (including against marked historical ranges).
with conflicts as (
  select a.id from reservations a join reservations b on a.id <> b.id
    and daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]')
)
update reservations set needs_resolution = true where id in (select id from conflicts);
with conflicts as (
  select a.id from rentals a join rentals b on a.id <> b.id and a.status <> 'cancelled' and b.status <> 'cancelled'
    and daterange(a.checkin_date, a.checkout_date, '[)') && daterange(b.checkin_date, b.checkout_date, '[)')
)
update rentals set needs_resolution = true where id in (select id from conflicts);

create table if not exists family_calendar_public (
  id uuid primary key, family_id text not null, start_date date not null, end_date date not null
);
create table if not exists ops_rentals_public (
  id uuid primary key, source text not null, checkin_date date not null, checkout_date date not null, status text not null
);
create table if not exists ops_cleanings_public (
  id uuid primary key, rental_id uuid not null, scheduled_date date not null, status text not null
);

create or replace function sync_family_calendar_public() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' then delete from family_calendar_public where id = old.id; return old; end if;
  insert into family_calendar_public (id,family_id,start_date,end_date) values (new.id,new.family_id,new.start_date,new.end_date)
  on conflict (id) do update set family_id=excluded.family_id,start_date=excluded.start_date,end_date=excluded.end_date;
  return new;
end $$;
create or replace function sync_ops_rental_public() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' then delete from ops_rentals_public where id = old.id; return old; end if;
  insert into ops_rentals_public (id,source,checkin_date,checkout_date,status) values (new.id,'arriendo',new.checkin_date,new.checkout_date,new.status)
  on conflict (id) do update set checkin_date=excluded.checkin_date,checkout_date=excluded.checkout_date,status=excluded.status;
  return new;
end $$;
create or replace function sync_ops_cleaning_public() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' then delete from ops_cleanings_public where id = old.id; return old; end if;
  insert into ops_cleanings_public (id,rental_id,scheduled_date,status) values (new.id,new.rental_id,new.scheduled_date,new.status)
  on conflict (id) do update set rental_id=excluded.rental_id,scheduled_date=excluded.scheduled_date,status=excluded.status;
  return new;
end $$;
create or replace function notify_ops_comment_change() returns trigger language plpgsql security definer as $$
declare target_cleaning uuid;
begin
  if tg_op = 'DELETE' then target_cleaning := old.cleaning_id; else target_cleaning := new.cleaning_id; end if;
  -- Realtime receives only the already-safe cleaning projection; clients then
  -- reload their authorized comment history through calendar-api.
  update ops_cleanings_public set status = status where id = target_cleaning;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists reservations_public_sync on reservations;
create trigger reservations_public_sync after insert or update or delete on reservations for each row execute function sync_family_calendar_public();
drop trigger if exists rentals_public_sync on rentals;
create trigger rentals_public_sync after insert or update or delete on rentals for each row execute function sync_ops_rental_public();
drop trigger if exists cleanings_public_sync on cleanings;
create trigger cleanings_public_sync after insert or update or delete on cleanings for each row execute function sync_ops_cleaning_public();
drop trigger if exists cleaning_comments_public_notify on cleaning_comments;
create trigger cleaning_comments_public_notify after insert or update or delete on cleaning_comments for each row execute function notify_ops_comment_change();
insert into family_calendar_public select id,family_id,start_date,end_date from reservations on conflict (id) do update set family_id=excluded.family_id,start_date=excluded.start_date,end_date=excluded.end_date;
insert into ops_rentals_public select id,'arriendo',checkin_date,checkout_date,status from rentals on conflict (id) do update set checkin_date=excluded.checkin_date,checkout_date=excluded.checkout_date,status=excluded.status;
insert into ops_cleanings_public select id,rental_id,scheduled_date,status from cleanings on conflict (id) do update set rental_id=excluded.rental_id,scheduled_date=excluded.scheduled_date,status=excluded.status;

create or replace function calendar_create_reservation(p_id uuid, p_family_id text, p_start_date date, p_end_date date, p_note text)
returns reservations language plpgsql security definer set search_path = public as $$
declare saved reservations;
begin
  perform pg_advisory_xact_lock(9101);
  if p_family_id not in ('papas','quiroz-ayala','ayala-gonzalez','cattan-ayala','coco') then raise exception 'Familia no válida'; end if;
  if p_end_date < p_start_date then raise exception 'La salida no puede ser anterior a la llegada'; end if;
  if exists (select 1 from reservations where daterange(start_date,end_date,'[]') && daterange(p_start_date,p_end_date,'[]')) then raise exception 'El rango se solapa con una reserva existente'; end if;
  insert into reservations (id,family_id,start_date,end_date,note) values (coalesce(p_id,gen_random_uuid()),p_family_id,p_start_date,p_end_date,p_note) returning * into saved;
  return saved;
end $$;
create or replace function calendar_delete_reservation(p_id uuid) returns void language plpgsql security definer set search_path = public as $$ begin delete from reservations where id=p_id; end $$;

create or replace function calendar_upsert_rental(p_id uuid, p_source text, p_reference text, p_guest_name text, p_checkin_date date, p_checkout_date date, p_notes text, p_status text)
returns rentals language plpgsql security definer set search_path = public as $$
declare saved rentals;
begin
  perform pg_advisory_xact_lock(9102);
  if p_checkout_date < p_checkin_date then raise exception 'Check-out no puede ser anterior a check-in'; end if;
  if exists (select 1 from rentals where id is distinct from p_id and status <> 'cancelled' and daterange(checkin_date,checkout_date,'[)') && daterange(p_checkin_date,p_checkout_date,'[)')) then raise exception 'El rango se solapa con un arriendo existente'; end if;
  insert into rentals (id,source,reference,guest_name,checkin_date,checkout_date,notes,status)
  values (coalesce(p_id,gen_random_uuid()),p_source,p_reference,p_guest_name,p_checkin_date,p_checkout_date,p_notes,p_status)
  on conflict (id) do update set source=excluded.source,reference=excluded.reference,guest_name=excluded.guest_name,checkin_date=excluded.checkin_date,checkout_date=excluded.checkout_date,notes=excluded.notes,status=excluded.status
  returning * into saved;
  if exists (select 1 from cleanings where rental_id=saved.id) then
    update cleanings set scheduled_date=saved.checkout_date,
      status=case when saved.status='cancelled' then 'cancelled' else cleanings.status end
      where rental_id=saved.id;
  else
    insert into cleanings (rental_id,scheduled_date,scheduled_time,status)
    values (saved.id,saved.checkout_date,'12:00',case when saved.status='cancelled' then 'cancelled' else 'pending' end);
  end if;
  return saved;
end $$;
create or replace function calendar_update_cleaning(p_id uuid, p_rental_id uuid, p_status text, p_scheduled_date date, p_scheduled_time time)
returns cleanings language plpgsql security definer set search_path = public as $$
declare saved cleanings;
begin
  update cleanings set status=coalesce(p_status,status),scheduled_date=coalesce(p_scheduled_date,scheduled_date),scheduled_time=coalesce(p_scheduled_time,scheduled_time)
  where id=p_id or rental_id=p_rental_id returning * into saved;
  if not found then raise exception 'No se encontró la tarea'; end if;
  return saved;
end $$;

alter table family_calendar_public enable row level security;
alter table ops_rentals_public enable row level security;
alter table ops_cleanings_public enable row level security;
drop policy if exists public_calendar_read on family_calendar_public;
drop policy if exists public_ops_rentals_read on ops_rentals_public;
drop policy if exists public_ops_cleanings_read on ops_cleanings_public;
create policy public_calendar_read on family_calendar_public for select using (true);
create policy public_ops_rentals_read on ops_rentals_public for select using (true);
create policy public_ops_cleanings_read on ops_cleanings_public for select using (true);
grant select on family_calendar_public,ops_rentals_public,ops_cleanings_public to anon, authenticated;
grant execute on function calendar_create_reservation(uuid,text,date,date,text), calendar_delete_reservation(uuid), calendar_upsert_rental(uuid,text,text,text,date,date,text,text), calendar_update_cleaning(uuid,uuid,text,date,time) to service_role;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='family_calendar_public') then alter publication supabase_realtime add table family_calendar_public; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ops_rentals_public') then alter publication supabase_realtime add table ops_rentals_public; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ops_cleanings_public') then alter publication supabase_realtime add table ops_cleanings_public; end if;
end $$;
