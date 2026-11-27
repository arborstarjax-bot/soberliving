-- Blockers: admin/manager-authored acknowledgment-required messages
-- that force residents into a full-screen "acknowledge" page (just
-- like /sign-commitment) until they sign off on each one.
--
-- Targeting modes:
--   * all        — every active resident
--   * house      — residents whose active resident row is in
--                  target_house_ids
--   * residents  — specific users listed in target_user_ids
--
-- Acknowledgment is a click + drawn signature. The resident sees a
-- PDF rendered from the blocker title/body and signs. If
-- save_to_docs is true, that signed PDF is written into the
-- documents table so it shows up in the resident's Documents view.

CREATE TABLE IF NOT EXISTS public.blockers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  body text NOT NULL,
  attachment_paths text[] NOT NULL DEFAULT '{}',
  target_type text NOT NULL
    CHECK (target_type IN ('all', 'house', 'residents')),
  target_house_ids uuid[] NOT NULL DEFAULT '{}',
  target_user_ids uuid[] NOT NULL DEFAULT '{}',
  save_to_docs boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_blockers_active
  ON public.blockers (created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_blockers_target_type
  ON public.blockers (target_type)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.blocker_acknowledgments (
  blocker_id uuid NOT NULL REFERENCES public.blockers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  signature text NOT NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  PRIMARY KEY (blocker_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_blocker_acks_user
  ON public.blocker_acknowledgments (user_id);

-- No RLS policies. Every reader/writer is going through the
-- admin (service-role) client on the server, same pattern as
-- house_commitments and bulletin_posts. Residents never hit the
-- DB directly from the client.

-- Storage bucket for attachments. Private — residents fetch via
-- short-lived signed URLs minted from the acknowledge action.
-- Idempotent: storage.buckets rows are global, on conflict do nothing.
insert into storage.buckets (id, name, public)
values ('blocker-attachments', 'blocker-attachments', false)
on conflict (id) do nothing;

-- Permissive authenticated-only storage policies for the bucket.
-- Per-blocker access checks live in the app layer (acknowledge
-- action + admin action verify target + ownership before signing
-- URLs). Same pattern as house-documents.
drop policy if exists "blocker_attachments_select" on storage.objects;
create policy "blocker_attachments_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'blocker-attachments');

drop policy if exists "blocker_attachments_insert" on storage.objects;
create policy "blocker_attachments_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'blocker-attachments');

drop policy if exists "blocker_attachments_delete" on storage.objects;
create policy "blocker_attachments_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'blocker-attachments');
