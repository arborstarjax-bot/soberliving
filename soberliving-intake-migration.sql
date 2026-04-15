-- Jax Sober Living: Intake Forms & Documents Migration
-- Run this in your Supabase SQL Editor

-- 1. Add intake_completed and is_resident columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS intake_completed boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_resident boolean NOT NULL DEFAULT false;

-- 2. Create intake_forms table
CREATE TABLE IF NOT EXISTS public.intake_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  form_data jsonb DEFAULT '{}'::jsonb,
  signatures jsonb DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create documents table
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_type text NOT NULL DEFAULT 'other',
  storage_path text NOT NULL,
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create Supabase Storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage policies for documents bucket
CREATE POLICY "Staff can upload documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (public.is_admin() OR public.is_staff())
  );

CREATE POLICY "Authenticated users can upload own documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Staff can read all documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (public.is_admin() OR public.is_staff())
  );

CREATE POLICY "Users can read own documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. RLS for intake_forms
ALTER TABLE public.intake_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own intake forms" ON public.intake_forms
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Staff can read all intake forms" ON public.intake_forms
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_staff());

-- 7. RLS for documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own documents" ON public.documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Staff can read all documents" ON public.documents
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_staff());

CREATE POLICY "Users can insert own documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Staff can insert any documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_staff());

-- 8. Update get_session_user RPC to include intake_completed and is_resident
CREATE OR REPLACE FUNCTION public.get_session_user(p_user_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT json_build_object(
    'id', u.id,
    'email', u.email,
    'full_name', u.full_name,
    'role', coalesce(ur.role, 'resident'),
    'intake_completed', coalesce(u.intake_completed, false),
    'is_resident', coalesce(u.is_resident, false)
  )
  FROM public.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE u.id = p_user_id;
$$;
