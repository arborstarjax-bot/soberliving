-- Generic commitment contract: the "Executive Director" name printed
-- on the house commitment agreement, per workspace.
alter table public.workspace_settings
  add column if not exists director_name text;
