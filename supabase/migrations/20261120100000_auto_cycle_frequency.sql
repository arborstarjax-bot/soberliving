-- How often auto-cycle fires (and how long each auto-created cycle lasts):
-- daily | weekly | biweekly | monthly. Existing workspaces keep 'weekly'.
alter table public.workspace_settings
  add column if not exists auto_cycle_frequency text not null default 'weekly';
