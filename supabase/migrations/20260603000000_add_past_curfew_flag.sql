-- Add a boolean flag to mark sign-ins that happened past curfew or
-- the next day (missed sign-in). Computed by the app at sign-in time
-- based on the house's curfew schedule.
alter table public.sign_out_sheet
  add column if not exists past_curfew boolean not null default false;
