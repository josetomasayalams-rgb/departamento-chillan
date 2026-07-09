-- Run only after every `needs_resolution = true` row has been edited or
-- cancelled. The first migration deliberately preserves historical conflicts;
-- this final hardening step makes Postgres reject any future bypass as well.

create extension if not exists btree_gist;

alter table reservations
  add constraint reservations_no_overlap
  exclude using gist (daterange(start_date, end_date, '[]') with &&);

alter table rentals
  add constraint rentals_no_active_overlap
  exclude using gist (daterange(checkin_date, checkout_date, '[)') with &&)
  where (status <> 'cancelled');
