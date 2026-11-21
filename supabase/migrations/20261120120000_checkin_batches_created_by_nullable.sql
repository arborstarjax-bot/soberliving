-- Scheduled check-in batches are created by the cron with no human
-- creator; allow created_by to be null for system-generated batches.
alter table public.check_in_batches
  alter column created_by drop not null;
