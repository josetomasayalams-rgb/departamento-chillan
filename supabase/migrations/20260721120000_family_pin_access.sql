-- La PWA se protege con la clave familiar en su pantalla de entrada.
-- Supabase deja de exigir una sesión OAuth para operar el calendario compartido.
drop policy if exists "calendar admins read reservations" on public.reservations;
drop policy if exists "calendar admins insert reservations" on public.reservations;
drop policy if exists "calendar admins update reservations" on public.reservations;
drop policy if exists "calendar admins delete reservations" on public.reservations;

create policy "family app reads reservations"
  on public.reservations for select to anon
  using (true);
create policy "family app inserts reservations"
  on public.reservations for insert to anon
  with check (true);
create policy "family app updates reservations"
  on public.reservations for update to anon
  using (true) with check (true);

grant select, insert, update on public.reservations to anon;
