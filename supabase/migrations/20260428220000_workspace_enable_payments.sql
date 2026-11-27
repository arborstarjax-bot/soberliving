-- Add enable_payments toggle to workspace_settings.
-- Defaults to true so existing workspaces keep payments visible.
alter table public.workspace_settings
  add column if not exists enable_payments boolean not null default true;
