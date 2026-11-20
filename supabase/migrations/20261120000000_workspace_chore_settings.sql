-- Workspace-level chore/meeting settings (per-workspace feature toggles).
alter table public.workspace_settings
  add column if not exists auto_cycle_chores boolean not null default false,
  add column if not exists auto_demerit_missed_chores boolean not null default false,
  add column if not exists require_chore_photo boolean not null default false,
  add column if not exists require_meeting_photo boolean not null default false;

-- Auto-cycled rotations are created by the cron job, not a user.
alter table public.chore_rotations
  alter column created_by drop not null;
alter table public.chore_rotation_assignments
  alter column assigned_by drop not null;
