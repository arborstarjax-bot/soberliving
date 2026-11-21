alter table public.users
  add column if not exists application_resent boolean not null default false;
