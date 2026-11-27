-- ============================================================
-- Workspace invite links: shareable join link with admin approval
-- ============================================================

-- Add invite_code to workspaces (shareable link code)
alter table public.workspaces
  add column if not exists invite_code text unique default encode(gen_random_bytes(16), 'hex');

-- Backfill existing workspaces that have NULL invite_code
update public.workspaces
set invite_code = encode(gen_random_bytes(16), 'hex')
where invite_code is null;

-- Make invite_code NOT NULL after backfill
alter table public.workspaces
  alter column invite_code set not null;

-- Add status to workspace_members for approval flow
alter table public.workspace_members
  add column if not exists status text not null default 'active'
  check (status in ('active', 'pending', 'denied'));

-- Index for invite code lookups
create index if not exists idx_workspaces_invite_code on public.workspaces(invite_code);
