-- Workspace-defined recurring check-ins, auto-sent by cron.
-- Shape: [{ "id": "...", "label": "Weekly check-in", "house_ids": ["..."],
--   "frequency": "daily"|"weekly", "day_of_week": 1, "enabled": true,
--   "last_sent_on": "2026-11-20" }]
alter table public.workspace_settings
  add column if not exists check_in_schedules jsonb not null default '[]'::jsonb;

-- Batches need a workspace scope so the sender can attribute them.
alter table public.check_in_batches
  add column if not exists workspace_id uuid,
  add column if not exists schedule_id text;
