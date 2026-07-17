-- =====================================================================
--  Reservas · Departamento Chillán — esquema Supabase
--  Pega esto en: Supabase → SQL Editor → New query → Run
-- =====================================================================

create table if not exists reservations (
  id          uuid primary key default gen_random_uuid(),
  family_id   text not null,
  start_date  date not null,
  end_date    date not null,
  note        text,
  created_at  timestamptz default now(),
  availability_version uuid not null default gen_random_uuid(),
  availability_changed_at timestamptz not null default now(),
  feed_verified_at timestamptz,
  airbnb_verified_at timestamptz,
  booking_verified_at timestamptz
);

-- Índice para buscar reservas por rango de fechas rápido
create index if not exists reservations_dates_idx
  on reservations (start_date, end_date);

create index if not exists reservations_availability_version_idx
  on reservations (availability_version);

-- Restricción hotelera: la salida es exclusiva y debe ser posterior a la llegada
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_dates_chk'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table reservations
      add constraint reservations_dates_chk check (end_date > start_date);
  end if;
end;
$$;

create or replace function public.track_reservation_availability_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date then
    new.availability_version := gen_random_uuid();
    new.availability_changed_at := now();
    new.feed_verified_at := null;
    new.airbnb_verified_at := null;
    new.booking_verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_track_availability_change on public.reservations;
create trigger reservations_track_availability_change
before update on public.reservations
for each row
execute function public.track_reservation_availability_change();

-- Seguridad a nivel de fila (RLS)
alter table reservations enable row level security;

drop policy if exists "public read" on reservations;
drop policy if exists "public write" on reservations;
create policy "public read"  on reservations for select using (true);
create policy "public write" on reservations for all
  using (true) with check (true);

-- Mantiene los permisos actuales del frontend y permite al feed leer con service_role
grant select, insert, update, delete on reservations to anon, authenticated;
grant all on reservations to service_role;

-- Tiempo real: que los cambios se reflejen en todos los dispositivos
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table reservations;
  end if;
end;
$$;
