-- ============================================================
-- Workspace multi-tenancy: workspaces, members, invites,
-- settings, payment config, and house curfews.
-- ============================================================

-- 1. Workspaces
create table if not exists public.workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Workspace members (source of truth for workspace-level roles)
create table if not exists public.workspace_members (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'resident')),
  invited_by uuid references public.users(id),
  joined_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

-- 3. Workspace invites
create table if not exists public.workspace_invites (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'resident')) default 'resident',
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid not null references public.users(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

-- 4. Workspace settings (one row per workspace)
create table if not exists public.workspace_settings (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade unique,
  require_application boolean not null default true,
  require_commitment boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Workspace payment config
create table if not exists public.workspace_payment_config (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade unique,
  default_rent_amount numeric(10,2) not null default 0,
  payment_frequency text not null check (payment_frequency in ('weekly', 'bi-weekly', 'monthly')) default 'weekly',
  payment_due_day text, -- e.g. 'monday' for weekly, '1' for monthly
  accepted_methods text[] not null default '{"cash"}',
  late_fee_amount numeric(10,2) not null default 0,
  grace_period_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. House curfews (per-house, per-day)
create table if not exists public.house_curfews (
  id uuid primary key default uuid_generate_v4(),
  house_id uuid not null references public.houses(id) on delete cascade,
  day_of_week text not null check (day_of_week in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  curfew_time time not null default '22:00',
  unique(house_id, day_of_week)
);

-- 7. Add workspace_id to existing tables
alter table public.users add column if not exists workspace_id uuid references public.workspaces(id);
alter table public.houses add column if not exists workspace_id uuid references public.workspaces(id);

-- Index for workspace-scoped queries
create index if not exists idx_users_workspace on public.users(workspace_id);
create index if not exists idx_houses_workspace on public.houses(workspace_id);
create index if not exists idx_workspace_members_workspace on public.workspace_members(workspace_id);
create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_workspace_invites_token on public.workspace_invites(token);
create index if not exists idx_workspace_invites_email on public.workspace_invites(email);
