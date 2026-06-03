-- Add a curfew start time to define the curfew window.
-- curfew_start_time = when curfew begins (e.g. 22:00)
-- curfew_time = when curfew ends (e.g. 06:00 next morning)
-- If only curfew_time is set, start defaults to the same value
-- (i.e. anything after that time is past curfew).
alter table public.house_curfews
  add column if not exists curfew_start_time text;
