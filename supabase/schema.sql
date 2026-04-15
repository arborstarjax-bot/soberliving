-- ============================================================
-- Sober Living House Management App — Database Schema
-- Run this in Supabase SQL Editor to create all tables
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. Users
-- ============================================================

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. User Roles
-- ============================================================

create table if not exists public.user_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('admin', 'manager', 'resident')),
  created_at timestamptz not null default now(),
  unique(user_id)
);

-- ============================================================
-- 3. Houses
-- ============================================================

create table if not exists public.houses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  phone text,
  capacity integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. Manager ↔ House Assignments
-- ============================================================

create table if not exists public.manager_house_assignments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);

-- ============================================================
-- 5. Rooms
-- ============================================================

create table if not exists public.rooms (
  id uuid primary key default uuid_generate_v4(),
  house_id uuid not null references public.houses(id) on delete cascade,
  name text not null,
  floor integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. Beds
-- ============================================================

create table if not exists public.beds (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7. Residents
-- ============================================================

create table if not exists public.residents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete set null,
  house_id uuid not null references public.houses(id) on delete cascade,
  full_name text not null,
  date_of_birth date,
  phone text,
  email text,
  emergency_contact_name text not null,
  emergency_contact_phone text not null,
  emergency_contact_relationship text,
  sobriety_date date,
  move_in_date date not null,
  move_out_date date,
  status text not null default 'active' check (status in ('active', 'discharged', 'on_leave')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 8. Bed Assignments
-- ============================================================

create table if not exists public.bed_assignments (
  id uuid primary key default uuid_generate_v4(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  bed_id uuid not null references public.beds(id) on delete cascade,
  start_date date not null default current_date,
  end_date date,
  assigned_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

-- Prevent double-booking: only one active assignment per bed
create unique index if not exists idx_bed_assignments_active_bed
  on public.bed_assignments (bed_id) where end_date is null;

-- ============================================================
-- 9. Chores (per-house chore templates)
-- ============================================================

create table if not exists public.chores (
  id uuid primary key default uuid_generate_v4(),
  house_id uuid not null references public.houses(id) on delete cascade,
  name text not null,
  days_of_week text[] not null default '{monday,wednesday,friday}',
  cycle_weeks integer not null default 2 check (cycle_weeks between 1 and 4),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 10. Chore Tasks (specific tasks within a chore)
-- ============================================================

create table if not exists public.chore_tasks (
  id uuid primary key default uuid_generate_v4(),
  chore_id uuid not null references public.chores(id) on delete cascade,
  description text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 11. Chore Rotations (2-week cycles per house)
-- ============================================================

create table if not exists public.chore_rotations (
  id uuid primary key default uuid_generate_v4(),
  house_id uuid not null references public.houses(id) on delete cascade,
  cycle_start_date date not null,
  cycle_end_date date not null,
  is_current boolean not null default false,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

-- Only one current rotation per house
create unique index if not exists idx_chore_rotations_current
  on public.chore_rotations (house_id) where is_current = true;

-- ============================================================
-- 12. Chore Rotation Assignments (chore → resident for a rotation)
-- ============================================================

create table if not exists public.chore_rotation_assignments (
  id uuid primary key default uuid_generate_v4(),
  rotation_id uuid not null references public.chore_rotations(id) on delete cascade,
  chore_id uuid not null references public.chores(id) on delete cascade,
  resident_id uuid not null references public.residents(id) on delete cascade,
  assigned_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique(rotation_id, chore_id)
);

-- ============================================================
-- 13. Chore Signoffs (Mon/Wed/Fri tracking per assignment)
-- ============================================================

create table if not exists public.chore_signoffs (
  id uuid primary key default uuid_generate_v4(),
  rotation_assignment_id uuid not null references public.chore_rotation_assignments(id) on delete cascade,
  sign_off_date date not null,
  day_of_week text not null check (day_of_week in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  week_number integer not null check (week_number between 1 and 4),
  status text not null default 'pending' check (status in ('pending', 'completed_pending_review', 'approved', 'rejected', 'missed')),
  completed_at timestamptz,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  rejection_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 14. Incidents
-- ============================================================

create table if not exists public.incidents (
  id uuid primary key default uuid_generate_v4(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  reported_by uuid not null references public.users(id),
  severity text not null check (severity in ('minor', 'major', 'critical')),
  category text,
  description text not null,
  occurred_at date not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 15. Leave Requests
-- ============================================================

create table if not exists public.leave_requests (
  id uuid primary key default uuid_generate_v4(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  requested_by uuid not null references public.users(id),
  departure_date date not null,
  expected_return_date date not null,
  actual_return_date date,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'returned')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  denial_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 16. Resident Notes (staff-only)
-- ============================================================

create table if not exists public.resident_notes (
  id uuid primary key default uuid_generate_v4(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  author_id uuid not null references public.users(id),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 17. Activity Log
-- ============================================================

create table if not exists public.activity_log (
  id uuid primary key default uuid_generate_v4(),
  house_id uuid references public.houses(id) on delete set null,
  resident_id uuid references public.residents(id) on delete set null,
  actor_id uuid references public.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  description text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Index for timeline queries
create index if not exists idx_activity_log_resident on public.activity_log(resident_id, created_at desc);
create index if not exists idx_activity_log_house on public.activity_log(house_id, created_at desc);
create index if not exists idx_activity_log_created on public.activity_log(created_at desc);

-- ============================================================
-- Helper function: update house capacity when beds change
-- ============================================================

create or replace function public.update_house_capacity(p_house_id uuid)
returns void as $$
begin
  update public.houses
  set capacity = (
    select count(*)
    from public.beds b
    join public.rooms r on r.id = b.room_id
    where r.house_id = p_house_id and b.is_active = true
  ),
  updated_at = now()
  where id = p_house_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- Row Level Security (RLS) Policies
-- ============================================================

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.houses enable row level security;
alter table public.manager_house_assignments enable row level security;
alter table public.rooms enable row level security;
alter table public.beds enable row level security;
alter table public.residents enable row level security;
alter table public.bed_assignments enable row level security;
alter table public.chores enable row level security;
alter table public.chore_tasks enable row level security;
alter table public.chore_rotations enable row level security;
alter table public.chore_rotation_assignments enable row level security;
alter table public.chore_signoffs enable row level security;
alter table public.incidents enable row level security;
alter table public.leave_requests enable row level security;
alter table public.resident_notes enable row level security;
alter table public.activity_log enable row level security;

-- Service role bypass (for server-side operations via supabase client)
-- The anon key + service_role key distinction handles this at the client level.
-- For the app, we use the anon key with auth context, so we need policies.

-- Users: authenticated users can read all, only admins can modify
create policy "Users are viewable by authenticated users"
  on public.users for select to authenticated
  using (true);

create policy "Users can update own profile"
  on public.users for update to authenticated
  using (id = auth.uid());

create policy "Admins can insert users"
  on public.users for insert to authenticated
  with check (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

-- User roles: viewable by authenticated, modifiable by admins
create policy "User roles are viewable by authenticated users"
  on public.user_roles for select to authenticated
  using (true);

create policy "Admins can manage user roles"
  on public.user_roles for all to authenticated
  using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Houses: viewable by all authenticated, modifiable by admins
create policy "Houses are viewable by authenticated users"
  on public.houses for select to authenticated
  using (true);

create policy "Admins can manage houses"
  on public.houses for all to authenticated
  using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Manager assignments: viewable by authenticated
create policy "Manager assignments viewable by authenticated"
  on public.manager_house_assignments for select to authenticated
  using (true);

create policy "Admins can manage manager assignments"
  on public.manager_house_assignments for all to authenticated
  using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Rooms, Beds: viewable by authenticated, managed by admin/managers
create policy "Rooms viewable by authenticated"
  on public.rooms for select to authenticated using (true);

create policy "Staff can manage rooms"
  on public.rooms for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

create policy "Beds viewable by authenticated"
  on public.beds for select to authenticated using (true);

create policy "Staff can manage beds"
  on public.beds for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

-- Residents: viewable by staff, own data for residents
create policy "Staff can view all residents"
  on public.residents for select to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
    or user_id = auth.uid()
  );

create policy "Staff can manage residents"
  on public.residents for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

-- Bed assignments
create policy "Bed assignments viewable by authenticated"
  on public.bed_assignments for select to authenticated using (true);

create policy "Staff can manage bed assignments"
  on public.bed_assignments for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

-- Chores and related tables
create policy "Chores viewable by authenticated"
  on public.chores for select to authenticated using (true);

create policy "Staff can manage chores"
  on public.chores for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

create policy "Chore tasks viewable by authenticated"
  on public.chore_tasks for select to authenticated using (true);

create policy "Staff can manage chore tasks"
  on public.chore_tasks for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

create policy "Chore rotations viewable by authenticated"
  on public.chore_rotations for select to authenticated using (true);

create policy "Staff can manage chore rotations"
  on public.chore_rotations for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

create policy "Rotation assignments viewable by authenticated"
  on public.chore_rotation_assignments for select to authenticated using (true);

create policy "Staff can manage rotation assignments"
  on public.chore_rotation_assignments for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

create policy "Signoffs viewable by authenticated"
  on public.chore_signoffs for select to authenticated using (true);

create policy "Authenticated users can update signoffs"
  on public.chore_signoffs for update to authenticated using (true);

create policy "Staff can insert signoffs"
  on public.chore_signoffs for insert to authenticated
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

create policy "Staff can delete signoffs"
  on public.chore_signoffs for delete to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

-- Incidents
create policy "Incidents viewable by staff"
  on public.incidents for select to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

create policy "Staff can manage incidents"
  on public.incidents for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

-- Leave requests
create policy "Leave requests viewable by staff or own"
  on public.leave_requests for select to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
    or requested_by = auth.uid()
  );

create policy "Authenticated can create leave requests"
  on public.leave_requests for insert to authenticated
  with check (true);

create policy "Staff can update leave requests"
  on public.leave_requests for update to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

-- Resident notes (staff only)
create policy "Notes viewable by staff"
  on public.resident_notes for select to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

create policy "Staff can manage notes"
  on public.resident_notes for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

-- Activity log
create policy "Activity log viewable by staff"
  on public.activity_log for select to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role in ('admin', 'manager')
    )
    or resident_id in (
      select id from public.residents where user_id = auth.uid()
    )
  );

create policy "Authenticated can insert activity log"
  on public.activity_log for insert to authenticated
  with check (true);
