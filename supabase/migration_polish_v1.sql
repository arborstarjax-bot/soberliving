-- ============================================================
-- Polish v1 migration: supply list + house documents
-- Run in Supabase SQL editor. Idempotent.
-- ============================================================

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
