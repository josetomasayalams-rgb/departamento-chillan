-- Allow the static family calendar to request the same protected sync used by
-- Supabase Cron without exposing the Edge Function secret to the browser.

create or replace function public.request_calendar_ical_sync()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  newest_attempt timestamptz;
  request_id bigint;
begin
  if not pg_try_advisory_xact_lock(hashtext('calendar-ical-manual-sync')) then
    return jsonb_build_object('accepted', false, 'reason', 'running');
  end if;

  select max(last_attempt_at)
  into newest_attempt
  from public.calendar_sync_status;

  if newest_attempt is not null
     and newest_attempt > now() - interval '45 seconds' then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'recent',
      'last_attempt_at', newest_attempt
    );
  end if;

  request_id := public.invoke_calendar_ical_sync();
  return jsonb_build_object('accepted', true, 'request_id', request_id);
end;
$$;

revoke all on function public.request_calendar_ical_sync() from public;
grant execute on function public.request_calendar_ical_sync() to anon, authenticated;
