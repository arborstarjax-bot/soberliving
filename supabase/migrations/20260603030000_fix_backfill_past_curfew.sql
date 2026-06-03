-- Fix: the original backfill compared to curfew_time (end-of-window, e.g. 06:00)
-- instead of curfew_start_time (start-of-window, e.g. 23:59). This caused any
-- sign-in after 6 AM to be incorrectly flagged.
--
-- Step 1: Reset all backfilled flags to false.
-- Only resets rows that were NOT flagged by the app at sign-in time
-- (i.e. rows that existed before the past_curfew column was added).
-- We identify these by checking that the sign-in happened before the
-- migration was deployed (before 2026-06-03).
update public.sign_out_sheet
set past_curfew = false
where past_curfew = true
  and time_in < '2026-06-03T00:00:00Z';

-- Step 2: Re-run backfill with the correct comparison using
-- curfew_start_time (with fallback to curfew_time).
update public.sign_out_sheet s
set past_curfew = true
from public.house_curfews c
where s.time_in is not null
  and s.past_curfew = false
  and s.time_in < '2026-06-03T00:00:00Z'
  and c.house_id = s.house_id
  and c.day_of_week = lower(to_char(s.time_out at time zone 'America/New_York', 'FMDay'))
  and (
    (s.time_in at time zone 'America/New_York')::date
      <> (s.time_out at time zone 'America/New_York')::date
    or
    (s.time_in at time zone 'America/New_York')::time
      > coalesce(c.curfew_start_time, c.curfew_time)::time
  );
