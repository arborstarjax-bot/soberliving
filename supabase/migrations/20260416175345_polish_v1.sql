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

-- ---- Intake denial metadata ----
-- Admin-only intake denial stores a reason + who/when, surfaced to the
-- applicant on /application-denied. Reopen clears all three columns and
-- flips account_status back to 'active'. Nullable because only rejected
-- rows ever have values.
alter table public.users
  add column if not exists denial_reason text,
  add column if not exists denied_at timestamptz,
  add column if not exists denied_by uuid references public.users(id) on delete set null;

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

-- ---- Sign Out Sheet ----
-- Quick in/out log for residents leaving the house for short trips
-- (work, meeting, store, family). Separate from leave_requests — no
-- approval workflow, just a running log with a destination + time out
-- and (eventually) a time in. One "open" row per resident at a time
-- (time_in IS NULL).
create table if not exists public.sign_out_sheet (
  id uuid primary key default uuid_generate_v4(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  destination text not null,
  destination_category text,
  notes text,
  time_out timestamptz not null default now(),
  time_in timestamptz,
  signed_out_by uuid references public.users(id) on delete set null,
  signed_in_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sign_out_sheet_resident_time_out_desc
  on public.sign_out_sheet (resident_id, time_out desc);
create index if not exists idx_sign_out_sheet_house_time_out_desc
  on public.sign_out_sheet (house_id, time_out desc);
-- Partial index for "currently out" lookups across a house.
create index if not exists idx_sign_out_sheet_house_open
  on public.sign_out_sheet (house_id) where time_in is null;

-- One open sign-out at a time per resident. A resident must sign back
-- in before starting another trip. Enforced with a partial unique
-- index on resident_id where time_in IS NULL.
create unique index if not exists uq_sign_out_sheet_open_per_resident
  on public.sign_out_sheet (resident_id) where time_in is null;

alter table public.sign_out_sheet enable row level security;

-- Everyone authenticated can read (RLS-friendly, list filtering
-- happens in app code based on role and house scope).
drop policy if exists "sign_out_sheet_select" on public.sign_out_sheet;
create policy "sign_out_sheet_select"
  on public.sign_out_sheet for select to authenticated using (true);

-- Residents can sign themselves in/out; staff can sign anyone in their
-- house in/out. We check role via user_roles and let app code enforce
-- the house-assignment scoping.
drop policy if exists "sign_out_sheet_mutate" on public.sign_out_sheet;
create policy "sign_out_sheet_mutate"
  on public.sign_out_sheet for all to authenticated
  using (
    exists (
      select 1 from public.residents r
      where r.id = sign_out_sheet.resident_id and r.user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('admin','manager')
    )
  )
  with check (
    exists (
      select 1 from public.residents r
      where r.id = sign_out_sheet.resident_id and r.user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('admin','manager')
    )
  );

-- ---- Payments revamp: charges + receipt numbers ----
-- Existing model: payments is a flat log. Staff re-type period/due-date
-- for every payment. There's no concept of "Carlos owes $500 for Dec".
--
-- New model: payment_charges holds one row per monthly rent period per
-- resident (opened automatically when their commitment is signed and
-- when each period rolls over). A payment can be linked to a charge
-- via payments.charge_id; the charge flips to 'paid' when it's fully
-- satisfied. Receipt numbers are allocated atomically as SL-YYYY-NNNN.

-- New columns on payments. All nullable so existing rows stay valid.
alter table public.payments
  add column if not exists charge_id uuid,
  add column if not exists receipt_number text,
  add column if not exists receipt_document_id uuid references public.documents(id) on delete set null,
  add column if not exists receipt_storage_path text;

-- Unique receipt numbers per facility (across all houses).
create unique index if not exists uq_payments_receipt_number
  on public.payments (receipt_number) where receipt_number is not null;

create table if not exists public.payment_charges (
  id uuid primary key default uuid_generate_v4(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  commitment_id uuid references public.house_commitments(id) on delete set null,
  charge_type text not null default 'rent'
    check (charge_type in ('rent','admin_fee','deposit','misc')),
  amount numeric(10,2) not null check (amount >= 0),
  due_date date not null,
  period_start date,
  period_end date,
  status text not null default 'open'
    check (status in ('open','paid','partial','void')),
  payment_id uuid references public.payments(id) on delete set null,
  paid_amount numeric(10,2) not null default 0 check (paid_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One rent charge per resident per due_date — prevents double-opening
-- when the opener runs more than once for the same period.
create unique index if not exists uq_payment_charges_resident_due_type
  on public.payment_charges (resident_id, due_date, charge_type);

create index if not exists idx_payment_charges_house_status_due
  on public.payment_charges (house_id, status, due_date);
create index if not exists idx_payment_charges_resident_due_desc
  on public.payment_charges (resident_id, due_date desc);

-- Back-link payments.charge_id to payment_charges.id now that the
-- table exists. Done as a separate statement so the alter above stays
-- rerunnable on fresh databases.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_charge_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_charge_id_fkey
      foreign key (charge_id) references public.payment_charges(id)
      on delete set null;
  end if;
end$$;

alter table public.payment_charges enable row level security;

drop policy if exists "payment_charges_select" on public.payment_charges;
create policy "payment_charges_select"
  on public.payment_charges for select to authenticated using (true);

-- Only staff (admin / manager) can open / modify charges. Residents
-- read-only so their dashboard can show "Next due."
drop policy if exists "payment_charges_mutate" on public.payment_charges;
create policy "payment_charges_mutate"
  on public.payment_charges for all to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('admin','manager')
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('admin','manager')
    )
  );

-- ---- Receipt number allocator ----
-- Per-year sequential counter. SL-YYYY-NNNN, NNNN zero-padded to 4
-- digits. Locked via row-level update so concurrent payments never
-- collide on a number.
create table if not exists public.payment_receipt_counters (
  year int primary key,
  next_seq int not null default 1,
  updated_at timestamptz not null default now()
);

create or replace function public.next_receipt_number(p_year int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  insert into public.payment_receipt_counters (year, next_seq)
    values (p_year, 1)
    on conflict (year) do nothing;
  update public.payment_receipt_counters
    set next_seq = next_seq + 1,
        updated_at = now()
    where year = p_year
    returning next_seq - 1 into v_seq;
  return 'SL-' || p_year::text || '-' || lpad(v_seq::text, 4, '0');
end$$;

grant execute on function public.next_receipt_number(int) to authenticated;

-- ---- Atomic charge-balance updates ----
-- createPayment / voidPayment used to read payment_charges.paid_amount,
-- add/subtract in JS, then write the new value back. Two concurrent
-- payments against the same charge could clobber each other. These two
-- RPCs collapse the read-modify-write into a single atomic UPDATE so
-- the math is performed server-side.
create or replace function public.apply_payment_to_charge(
  p_charge_id uuid,
  p_amount numeric,
  p_payment_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.payment_charges
     set paid_amount = paid_amount + p_amount,
         status      = case
                         when paid_amount + p_amount >= amount then 'paid'
                         else 'partial'
                       end,
         payment_id  = case
                         when paid_amount + p_amount >= amount then p_payment_id
                         else payment_id
                       end,
         updated_at  = now()
   where id = p_charge_id;
$$;

grant execute on function public.apply_payment_to_charge(uuid, numeric, uuid) to authenticated;

create or replace function public.reverse_payment_from_charge(
  p_charge_id uuid,
  p_amount numeric
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.payment_charges
     set paid_amount = greatest(0, paid_amount - p_amount),
         status      = case
                         when greatest(0, paid_amount - p_amount) = 0 then 'open'
                         when greatest(0, paid_amount - p_amount) >= amount then 'paid'
                         else 'partial'
                       end,
         -- Always null out payment_id on a void — callers that need
         -- the full application history can consult the payments
         -- table. A dangling reference to a voided payment is worse
         -- than a null.
         payment_id  = null,
         updated_at  = now()
   where id = p_charge_id;
$$;

grant execute on function public.reverse_payment_from_charge(uuid, numeric) to authenticated;

-- ---- Commitment amendments ----
-- When admin edits payment terms, we draft a new house_commitments
-- row (status 'pending_resident_signature') linked to the currently
-- active commitment via parent_commitment_id. Once the resident
-- signs, the new row activates and we mark the parent 'superseded'.
-- The signed PDFs stay intact so each change has its own auditable
-- document.
alter table public.house_commitments
  add column if not exists parent_commitment_id uuid references public.house_commitments(id) on delete set null,
  add column if not exists amendment_reason text,
  add column if not exists effective_date date;

create index if not exists idx_house_commitments_parent
  on public.house_commitments (parent_commitment_id)
  where parent_commitment_id is not null;

-- A user can have at most one pending amendment at a time. The
-- partial unique index matches both initial onboarding (parent_id
-- null) and in-flight amendments.
create unique index if not exists uq_house_commitments_one_pending_per_user
  on public.house_commitments (user_id)
  where status = 'pending_resident_signature';
