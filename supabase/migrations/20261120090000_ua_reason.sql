-- Reason for a UA round (returning from leave, suspected use, etc).
alter table public.ua_tests
  add column if not exists reason text;
