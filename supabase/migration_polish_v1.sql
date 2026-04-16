-- ============================================================
-- Polish v1 migration: supply list + house documents +
-- voluntary-discharge flag on residents.
-- Run in Supabase SQL editor. Idempotent.
-- ============================================================

-- ---- Voluntary-discharge flag ----
-- Tracks whether a discharge was resident-initiated ("voluntary departure")
-- vs. staff-initiated. Populated by the Discharge dialog. Used in the
-- State of the House report to split discharges vs. voluntary departures.
alter table public.residents
  add column if not exists discharge_is_voluntary boolean;

-- ---- Supply items (per house) ----
create table if not exists public.supply_items (
  id uuid primary key default uuid_generate_v4(),
  house_id uuid not null references public.houses(id) on delete cascade,
  name text not null,
  is_in_stock boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_supply_items_house on public.supply_items(house_id, name);

alter table public.supply_items enable row level security;

drop policy if exists "supply_items_select" on public.supply_items;
create policy "supply_items_select"
  on public.supply_items for select to authenticated using (true);

drop policy if exists "supply_items_mutate" on public.supply_items;
create policy "supply_items_mutate"
  on public.supply_items for all to authenticated
  using (
    exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager'))
  )
  with check (
    exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager'))
  );

-- ---- House documents (uploaded files: reports, PDFs, etc.) ----
create table if not exists public.house_documents (
  id uuid primary key default uuid_generate_v4(),
  house_id uuid not null references public.houses(id) on delete cascade,
  name text not null,
  description text,
  file_path text not null,   -- path in storage bucket
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_house_documents_house on public.house_documents(house_id, created_at desc);

alter table public.house_documents enable row level security;

drop policy if exists "house_documents_select" on public.house_documents;
create policy "house_documents_select"
  on public.house_documents for select to authenticated using (true);

drop policy if exists "house_documents_mutate" on public.house_documents;
create policy "house_documents_mutate"
  on public.house_documents for all to authenticated
  using (
    exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager'))
  )
  with check (
    exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager'))
  );

-- ---- Storage bucket for house documents ----
-- Note: storage.buckets rows are global. This is idempotent.
insert into storage.buckets (id, name, public)
values ('house-documents', 'house-documents', false)
on conflict (id) do nothing;

-- Permissive authenticated-only policies for the bucket.
-- Finer per-house gating is enforced at the application layer via server actions.
drop policy if exists "house_documents_storage_select" on storage.objects;
create policy "house_documents_storage_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'house-documents');

drop policy if exists "house_documents_storage_insert" on storage.objects;
create policy "house_documents_storage_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'house-documents');

drop policy if exists "house_documents_storage_delete" on storage.objects;
create policy "house_documents_storage_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'house-documents');

-- ---- Account status ----
-- Column default is 'active' so any code path that inserts a user row
-- without explicitly setting the column (e.g. admin-invite flow) lands
-- on the correct status. Self-signup and admin-invite both explicitly
-- write 'active' today; rejected intake applicants are flipped to
-- 'rejected' via the intake-review Deny button.
alter table public.users
  add column if not exists account_status text not null default 'active'
    check (account_status in ('pending', 'active', 'rejected'));

-- If the column was added by an earlier run of this migration (when the
-- default was 'pending'), coerce the default to 'active' now. No-op if
-- it is already 'active'.
alter table public.users
  alter column account_status set default 'active';

-- Backfill: any users row that already existed before this column was
-- added (i.e. created more than a minute ago) is treated as an existing,
-- approved account and flipped to 'active'. Otherwise an existing admin
-- whose user_roles row has been deleted (or whose role lives elsewhere)
-- would be accidentally locked out by the new status gate.
-- New self-signups go through the signup server action which explicitly
-- writes 'pending', so they are not affected by this backfill.
update public.users u
  set account_status = 'active'
  where account_status <> 'active'
    and u.created_at < now() - interval '1 minute';

-- Allow a newly-signed-up user to insert their own public.users row.
-- Without this, self-signup fails under RLS because the only existing
-- insert policy requires an admin role. This policy is narrowly scoped
-- to the authenticated user's own id.
drop policy if exists "Users can insert their own profile" on public.users;
create policy "Users can insert their own profile"
  on public.users for insert to authenticated
  with check (auth.uid() = id);

-- ---- Rename legacy "[Empty]" bed labels to "[Not Available]" ----
-- The UI now says "Not Available" instead of "Empty" so the suffix that
-- flags a bed as unavailable was also renamed. Existing rows with the
-- old " [Empty]" suffix are migrated in place. The app still recognises
-- the legacy suffix for back-compat, but we update once so future logic
-- can assume the new label.
update public.beds
  set label = regexp_replace(label, ' \[Empty\]$', ' [Not Available]')
  where label like '% [Empty]';

-- ---- Pagination indexes ----
-- The Activity Log, Notifications, Bulletin, and Incidents pages all
-- paginate by (filter) + created_at DESC. Without these indexes the
-- planner has to sort every matching row on each page load, which is
-- fine at 100 rows and painful at 100k. Partial expressions match
-- exactly the queries in the server page code so the planner actually
-- picks them. All guarded by IF NOT EXISTS so the file stays idempotent.

-- Activity Log: filtered by house_id + ordered by created_at desc.
create index if not exists idx_activity_log_house_created_desc
  on public.activity_log (house_id, created_at desc);

-- Activity Log: per-event-type filter (category tabs).
create index if not exists idx_activity_log_event_type_created_desc
  on public.activity_log (event_type, created_at desc);

-- Notifications: per-user feed + unread count.
create index if not exists idx_notifications_user_created_desc
  on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id) where is_read = false;

-- Bulletin posts: pinned-first feed scoped to a set of houses.
create index if not exists idx_bulletin_posts_pinned_created_desc
  on public.bulletin_posts (is_pinned desc, created_at desc);
create index if not exists idx_bulletin_posts_house_created_desc
  on public.bulletin_posts (house_id, created_at desc);

-- Incidents: house-scoped feed ordered by occurred_at desc.
create index if not exists idx_incidents_house_occurred_desc
  on public.incidents (house_id, occurred_at desc);

-- Demerits: house-scoped, created_at desc (discipline page).
create index if not exists idx_demerits_house_created_desc
  on public.demerits (house_id, created_at desc);
create index if not exists idx_demerits_resident_created_desc
  on public.demerits (resident_id, created_at desc);

-- Restrictions: active restrictions per house.
create index if not exists idx_restrictions_house_active
  on public.restrictions (house_id, is_active);

-- ---- Warnings (formal, documented warnings without points) ----
-- First-class disciplinary concept alongside demerits. Used for missed
-- chores and behavior issues that warrant documentation but not points.
-- Issuing a warning sends the resident a notification so they know what
-- needs to be corrected. Mirrors the demerits schema (minus points) so
-- the two can share patterns. signoff_id links a warning to the missed
-- chore it was issued for, if applicable.
create table if not exists public.warnings (
  id uuid primary key default uuid_generate_v4(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  reason text not null,
  category text,
  notes text,
  photo_url text,
  signoff_id uuid references public.chore_signoffs(id) on delete set null,
  issued_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_warnings_house_created_desc
  on public.warnings (house_id, created_at desc);
create index if not exists idx_warnings_resident_created_desc
  on public.warnings (resident_id, created_at desc);
create index if not exists idx_warnings_signoff_id
  on public.warnings (signoff_id) where signoff_id is not null;

alter table public.warnings enable row level security;

drop policy if exists "warnings_select" on public.warnings;
create policy "warnings_select"
  on public.warnings for select to authenticated using (true);

drop policy if exists "warnings_mutate" on public.warnings;
create policy "warnings_mutate"
  on public.warnings for all to authenticated
  using (
    exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager'))
  )
  with check (
    exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','manager'))
  );
