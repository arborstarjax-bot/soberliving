-- Tracks which houses have already received a curfew violation
-- notification on a given day, preventing duplicate pushes when
-- the cron runs every 15 minutes.
create table if not exists public.curfew_notification_log (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  notification_date date not null,
  residents_notified integer not null default 0,
  created_at timestamptz not null default now(),
  unique (house_id, notification_date)
);

-- Old rows are irrelevant after 7 days; auto-clean to keep the table tiny.
create index if not exists idx_curfew_notif_log_date
  on public.curfew_notification_log (notification_date);

-- RLS: only service_role (admin client) accesses this table.
alter table public.curfew_notification_log enable row level security;
