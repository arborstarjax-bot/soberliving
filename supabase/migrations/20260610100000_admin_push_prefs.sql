-- Admin/manager push notification preference columns.
-- push_sign_in_out: 'off' | 'all' | 'curfew_only'
-- push_intakes: boolean toggle for intake submission alerts
alter table public.users
  add column if not exists push_sign_in_out text not null default 'off',
  add column if not exists push_intakes boolean not null default true;
