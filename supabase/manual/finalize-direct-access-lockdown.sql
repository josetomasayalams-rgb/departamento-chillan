-- Run after both GitHub Pages deployments have been live for at least 10
-- minutes and the new API flows have passed smoke tests. This is intentionally
-- separate from the compatible migration so cached old clients are not broken.

revoke all on reservations,rentals,cleanings,cleaning_comments from anon, authenticated;
revoke all on calendar_pin_attempts from anon, authenticated;

drop policy if exists "public read" on reservations;
drop policy if exists "public write" on reservations;
drop policy if exists "public read" on rentals;
drop policy if exists "public write" on rentals;
drop policy if exists "public read" on cleanings;
drop policy if exists "public write" on cleanings;
drop policy if exists "public read" on cleaning_comments;
drop policy if exists "public write" on cleaning_comments;

revoke all on function calendar_create_reservation(uuid,text,date,date,text), calendar_delete_reservation(uuid), calendar_upsert_rental(uuid,text,text,text,date,date,text,text), calendar_update_cleaning(uuid,uuid,text,date,time) from public, anon, authenticated;
grant execute on function calendar_create_reservation(uuid,text,date,date,text), calendar_delete_reservation(uuid), calendar_upsert_rental(uuid,text,text,text,date,date,text,text), calendar_update_cleaning(uuid,uuid,text,date,time) to service_role;
