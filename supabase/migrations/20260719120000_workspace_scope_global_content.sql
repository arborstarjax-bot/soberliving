-- Workspace isolation for "global-ish" content tables.
--
-- bulletin_posts and grievances both allow rows with house_id NULL
-- ("post to everyone" / anonymous grievances) and blockers can target
-- target_type='all'. Those rows had no reliable per-tenant boundary,
-- so a new/other workspace could see another workspace's global posts
-- and grievances, and residents could be force-gated by another
-- workspace's blocker.
--
-- Add an explicit workspace_id to each table and backfill it from the
-- row's house / author / reporter so reads can scope by workspace.
-- New rows set workspace_id at insert time in the app layer.

-- ---- bulletin_posts ----
alter table public.bulletin_posts
  add column if not exists workspace_id uuid references public.workspaces(id);

-- Prefer the post's house workspace; fall back to the author's.
update public.bulletin_posts bp
set workspace_id = h.workspace_id
from public.houses h
where bp.house_id = h.id
  and bp.workspace_id is null
  and h.workspace_id is not null;

update public.bulletin_posts bp
set workspace_id = u.workspace_id
from public.users u
where bp.author_id = u.id
  and bp.workspace_id is null
  and u.workspace_id is not null;

create index if not exists idx_bulletin_posts_workspace
  on public.bulletin_posts (workspace_id);

-- ---- grievances ----
alter table public.grievances
  add column if not exists workspace_id uuid references public.workspaces(id);

-- Non-anonymous rows carry user_id / house_id; anonymous legacy rows
-- have neither and stay NULL (they only surface to legacy no-workspace
-- admins). New anonymous rows get workspace_id set at insert time.
update public.grievances g
set workspace_id = u.workspace_id
from public.users u
where g.user_id = u.id
  and g.workspace_id is null
  and u.workspace_id is not null;

update public.grievances g
set workspace_id = h.workspace_id
from public.houses h
where g.house_id = h.id
  and g.workspace_id is null
  and h.workspace_id is not null;

create index if not exists idx_grievances_workspace
  on public.grievances (workspace_id);

-- ---- blockers ----
alter table public.blockers
  add column if not exists workspace_id uuid references public.workspaces(id);

update public.blockers b
set workspace_id = u.workspace_id
from public.users u
where b.created_by = u.id
  and b.workspace_id is null
  and u.workspace_id is not null;

create index if not exists idx_blockers_workspace
  on public.blockers (workspace_id);
