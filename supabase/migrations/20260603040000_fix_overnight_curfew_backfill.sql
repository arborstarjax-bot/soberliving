-- Fix: the previous backfill used a simple `time > start` comparison which
-- doesn't handle overnight curfew windows (e.g. 23:59 → 06:00). A sign-in
-- at 00:17 is past the 23:59 curfew but is numerically LESS than 23:59,
-- so it was missed.
--
-- Step 1: Reset all pre-deployment flags (same cutoff as before).
update public.sign_out_sheet
set past_curfew = false
where past_curfew = true
  and time_in < '2026-06-03T00:00:00Z';

-- Step 2: Re-backfill with correct overnight window logic.
-- For overnight windows (start > end, e.g. 23:59 → 06:00):
--   past curfew if sign_in_time >= start OR sign_in_time < end
-- For same-day windows (start <= end):
--   past curfew if sign_in_time >= start
update public.sign_out_sheet s
set past_curfew = true
from public.house_curfews c
where s.time_in is not null
  and s.past_curfew = false
  and s.time_in < '2026-06-03T00:00:00Z'
  and c.house_id = s.house_id
  and c.day_of_week = lower(to_char(s.time_out at time zone 'America/New_York', 'FMDay'))
  and (
    -- Different calendar day = always past curfew (missed sign-in)
    (s.time_in at time zone 'America/New_York')::date
      <> (s.time_out at time zone 'America/New_York')::date
    or
    -- Overnight window (start > end): past curfew if time >= start OR time < end
    (
      coalesce(c.curfew_start_time::time, c.curfew_time) > c.curfew_time
      and (
        (s.time_in at time zone 'America/New_York')::time
          >= coalesce(c.curfew_start_time::time, c.curfew_time)
        or
        (s.time_in at time zone 'America/New_York')::time < c.curfew_time
      )
    )
    or
    -- Same-day window (start <= end): past curfew if time >= start
    (
      coalesce(c.curfew_start_time::time, c.curfew_time) <= c.curfew_time
      and (s.time_in at time zone 'America/New_York')::time
        >= coalesce(c.curfew_start_time::time, c.curfew_time)
    )
  );
