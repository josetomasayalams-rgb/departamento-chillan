-- Browsers may retain an authenticated Supabase session from the retired
-- Google OAuth flow. The PIN-only app must behave the same for anon and for
-- those persisted authenticated sessions.

drop policy if exists "family app reads reservations" on public.reservations;
drop policy if exists "family app inserts reservations" on public.reservations;
drop policy if exists "family app updates reservations" on public.reservations;

create policy "family app reads reservations"
  on public.reservations for select to anon, authenticated
  using (true);
create policy "family app inserts reservations"
  on public.reservations for insert to anon, authenticated
  with check (true);
create policy "family app updates reservations"
  on public.reservations for update to anon, authenticated
  using (true) with check (true);

grant select, insert, update on public.reservations to anon, authenticated;
