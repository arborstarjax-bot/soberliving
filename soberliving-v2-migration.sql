-- ============================================================
-- Migration: Leave Requests, Chores, Notifications & Disciplinary
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. Notifications Table
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  action_url text,
  entity_type text,
  entity_id text,
  is_read boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications(user_id, is_read, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can view own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy "Users can update own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid());

create policy "Authenticated can insert notifications"
  on public.notifications for insert to authenticated
  with check (true);

create policy "Users can delete own notifications"
  on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 2. Modify Leave Requests — add multi-step approval + overnight pass fields
-- ============================================================

-- Drop the old status check constraint and add new statuses
alter table public.leave_requests drop constraint if exists leave_requests_status_check;
alter table public.leave_requests add constraint leave_requests_status_check
  check (status in ('pending_cover', 'pending_manager', 'pending_admin', 'approved', 'rejected', 'returned'));

-- Update any existing 'pending' rows to 'pending_admin' (legacy)
update public.leave_requests set status = 'pending_admin' where status = 'pending';
-- Update any existing 'denied' rows to 'rejected'
update public.leave_requests set status = 'rejected' where status = 'denied';

-- Add multi-step approval columns
alter table public.leave_requests add column if not exists covering_resident_id uuid references public.residents(id) on delete set null;
alter table public.leave_requests add column if not exists cover_approved_at timestamptz;
alter table public.leave_requests add column if not exists cover_approved_by uuid references public.users(id) on delete set null;
alter table public.leave_requests add column if not exists house_manager_approved_at timestamptz;
alter table public.leave_requests add column if not exists house_manager_approved_by uuid references public.users(id) on delete set null;
alter table public.leave_requests add column if not exists admin_approved_at timestamptz;
alter table public.leave_requests add column if not exists admin_approved_by uuid references public.users(id) on delete set null;
alter table public.leave_requests add column if not exists rejection_step text;

-- Overnight pass fields (from PDF)
alter table public.leave_requests add column if not exists reason_for_pass text;
alter table public.leave_requests add column if not exists leaving_datetime timestamptz;
alter table public.leave_requests add column if not exists returning_datetime timestamptz;
alter table public.leave_requests add column if not exists transportation text;
alter table public.leave_requests add column if not exists companion text;
alter table public.leave_requests add column if not exists destination_address text;
alter table public.leave_requests add column if not exists chore_coverer text;

-- ============================================================
-- 3. Modify Chores — add scheduled_days
-- ============================================================

alter table public.chores add column if not exists scheduled_days text[] not null default '{}';

-- ============================================================
-- 3b. Add force_photo to residents (disciplinary per-resident setting)
-- ============================================================

alter table public.residents add column if not exists force_photo boolean not null default false;

-- ============================================================
-- 4. Chore Completions Table (daily tracking)
-- ============================================================

create table if not exists public.chore_completions (
  id uuid primary key default uuid_generate_v4(),
  chore_id uuid not null references public.chores(id) on delete cascade,
  resident_id uuid not null references public.residents(id) on delete cascade,
  completion_date date not null,
  photo_url text,
  status text not null default 'completed' check (status in ('completed', 'verified', 'rejected')),
  completed_by uuid not null references public.users(id),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique(chore_id, resident_id, completion_date)
);

create index if not exists idx_chore_completions_date on public.chore_completions(completion_date desc);
create index if not exists idx_chore_completions_resident on public.chore_completions(resident_id, completion_date desc);

alter table public.chore_completions enable row level security;

create policy "Chore completions viewable by authenticated"
  on public.chore_completions for select to authenticated using (true);

create policy "Authenticated can insert chore completions"
  on public.chore_completions for insert to authenticated
  with check (true);

create policy "Staff can update chore completions"
  on public.chore_completions for update to authenticated
  using (public.is_staff() or completed_by = auth.uid());

-- ============================================================
-- 5. Modify Demerits — add worked_off status and auto-generated fields
-- ============================================================

-- Drop the old status check constraint and add new statuses
alter table public.demerits drop constraint if exists demerits_status_check;
alter table public.demerits add constraint demerits_status_check
  check (status in ('active', 'worked_off', 'resolved', 'appealed'));

alter table public.demerits add column if not exists worked_off_by uuid references public.users(id) on delete set null;
alter table public.demerits add column if not exists worked_off_at timestamptz;
alter table public.demerits add column if not exists worked_off_note text;
alter table public.demerits add column if not exists auto_generated boolean not null default false;
alter table public.demerits add column if not exists source_chore_id uuid references public.chores(id) on delete set null;
alter table public.demerits add column if not exists source_date date;

-- Allow admins to delete demerits
drop policy if exists "Demerits deletable by admin" on public.demerits;
create policy "Demerits deletable by admin" on public.demerits
  for delete using (public.is_admin());

-- ============================================================
-- 6. Chore photo storage bucket
-- ============================================================

insert into storage.buckets (id, name, public)
values ('chore-photos', 'chore-photos', true)
on conflict (id) do nothing;

create policy "Authenticated can upload chore photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chore-photos');

create policy "Anyone can view chore photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'chore-photos');
