-- Backfill past_curfew flag on historical sign-out rows.
-- Marks a row as past_curfew = true when:
--   1. Sign-in happened on a different calendar day than sign-out, OR
--   2. Sign-in time-of-day is after the curfew_time for the sign-out day.
-- All comparisons done in America/New_York timezone.
update public.sign_out_sheet s
set past_curfew = true
from public.house_curfews c
where s.time_in is not null
  and s.past_curfew = false
  and c.house_id = s.house_id
  and c.day_of_week = lower(to_char(s.time_out at time zone 'America/New_York', 'FMDay'))
  and (
    -- Different calendar day (missed sign-in / next-day return)
    (s.time_in at time zone 'America/New_York')::date
      <> (s.time_out at time zone 'America/New_York')::date
    or
    -- Same day but sign-in time is after curfew
    (s.time_in at time zone 'America/New_York')::time > c.curfew_time::time
  );
