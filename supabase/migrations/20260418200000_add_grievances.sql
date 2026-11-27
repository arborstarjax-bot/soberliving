-- Grievances: resident-authored reports (grievance or problem)
-- inventoried in the admin-side Bulletin Board → Grievances tab.
--
-- Anonymous-reporting is a first-class feature. When a resident
-- checks "Submit anonymously" the row is inserted with user_id and
-- house_id both NULL so no server-side lookup can trace it back to
-- them. Managers are scoped by house_id and will never see
-- anonymous rows (house_id IS NULL); admins see everything. This is
-- deliberate — the alternative of "show house but hide name" would
-- let managers narrow down who in a small house authored the
-- report.

CREATE TABLE IF NOT EXISTS public.grievances (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Both NULL when submitted anonymously. Otherwise user_id is the
  -- resident who filed it and house_id is their active house at
  -- filing time (denormalized so manager-scope filters don't depend
  -- on whether the resident is still active in that house later).
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  house_id uuid REFERENCES public.houses(id) ON DELETE SET NULL,
  submitted_anonymously boolean NOT NULL DEFAULT false,

  report_type text NOT NULL
    CHECK (report_type IN ('grievance', 'problem')),
  subject text NOT NULL,
  description text NOT NULL,
  attachment_paths text[] NOT NULL DEFAULT '{}',

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved')),
  internal_notes text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Enforce the anonymous invariant at the DB level. Prevents a bad
  -- code path from inserting user_id on an anonymous row.
  CONSTRAINT grievances_anonymous_no_user
    CHECK (NOT submitted_anonymously OR (user_id IS NULL AND house_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_grievances_created_at
  ON public.grievances (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grievances_status
  ON public.grievances (status);
CREATE INDEX IF NOT EXISTS idx_grievances_house
  ON public.grievances (house_id)
  WHERE house_id IS NOT NULL;

-- No RLS policies. Residents never read grievances (they can create
-- via the server action; the action uses the admin client). Staff
-- read through the server-side bulletin pages which already go
-- through the admin client. Matches the blockers / bulletin_posts
-- pattern.

-- Storage bucket for attachments (photos / docs). Private — all
-- reads go through short-lived signed URLs minted server-side.
insert into storage.buckets (id, name, public)
values ('grievance-attachments', 'grievance-attachments', false)
on conflict (id) do nothing;

-- Permissive authenticated-only storage policies. Per-grievance
-- access checks live in the app layer. Same pattern as blocker-
-- attachments. We specifically do NOT write user_id into the storage
-- path for anonymous uploads — see uploadGrievanceAttachment in
-- src/app/(dashboard)/report/actions.ts for the path scheme.
drop policy if exists "grievance_attachments_select" on storage.objects;
create policy "grievance_attachments_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'grievance-attachments');

drop policy if exists "grievance_attachments_insert" on storage.objects;
create policy "grievance_attachments_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'grievance-attachments');

drop policy if exists "grievance_attachments_delete" on storage.objects;
create policy "grievance_attachments_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'grievance-attachments');
