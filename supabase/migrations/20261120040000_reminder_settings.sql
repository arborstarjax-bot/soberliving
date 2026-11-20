-- Per-type reminder toggles + timing for workspace notifications.
-- Shape: { "chore": {"enabled": bool, "timing": "day_of"|"day_before"}, "rent": {...}, "curfew": {...} }
-- Missing keys mean "on at defaults" so existing workspaces keep
-- today's behavior until an admin changes it.
alter table public.workspace_settings
  add column if not exists reminder_settings jsonb not null default '{}'::jsonb;

-- Which modules residents can see. NULL = residents see every
-- enabled module (legacy behavior).
alter table public.workspace_settings
  add column if not exists resident_modules text[];

-- Per-type auto-demerit toggles (off by default).
alter table public.workspace_settings
  add column if not exists auto_demerit_missed_meetings boolean not null default false,
  add column if not exists auto_demerit_missed_curfew boolean not null default false;
