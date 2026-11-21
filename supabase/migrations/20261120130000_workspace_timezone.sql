-- Workspace-level timezone. Houses already carry their own timezone for
-- due-date math; this column is the workspace default used when creating
-- new houses and as the org-wide display zone.
alter table public.workspace_settings
  add column if not exists timezone text not null default 'America/New_York';
