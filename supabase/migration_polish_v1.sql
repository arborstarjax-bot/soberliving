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

-- ---- Account status for self-signup approval flow ----
-- Open signup creates a users row with account_status = 'pending'.
-- Admins approve or reject from the admin panel. Existing rows are
-- backfilled to 'active' so current accounts are not interrupted.
alter table public.users
  add column if not exists account_status text not null default 'pending'
    check (account_status in ('pending', 'active', 'rejected'));

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
