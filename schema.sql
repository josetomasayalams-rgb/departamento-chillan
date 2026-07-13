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
  created_at  timestamptz default now()
);

-- Índice para buscar reservas por rango de fechas rápido
create index if not exists reservations_dates_idx
  on reservations (start_date, end_date);

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
