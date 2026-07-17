-- Track publication of family reservations without pretending Airbnb or Booking
-- acknowledged an iCal change. Provider verification is always manual.

alter table public.reservations
  add column if not exists availability_version uuid,
  add column if not exists availability_changed_at timestamptz,
  add column if not exists feed_verified_at timestamptz,
  add column if not exists airbnb_verified_at timestamptz,
  add column if not exists booking_verified_at timestamptz;

update public.reservations
set
  availability_version = coalesce(availability_version, gen_random_uuid()),
  availability_changed_at = coalesce(availability_changed_at, created_at, now()),
  feed_verified_at = coalesce(feed_verified_at, now())
where availability_version is null
   or availability_changed_at is null
   or feed_verified_at is null;

alter table public.reservations
  alter column availability_version set default gen_random_uuid(),
  alter column availability_version set not null,
  alter column availability_changed_at set default now(),
  alter column availability_changed_at set not null;

create index if not exists reservations_availability_version_idx
  on public.reservations (availability_version);

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

grant select, insert, update on public.reservations to anon, authenticated;
