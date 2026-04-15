-- Migration: House Commitments + commitment_signed on users
-- Run this in your Supabase SQL Editor

-- 1. Add commitment_signed to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS commitment_signed boolean NOT NULL DEFAULT false;

-- 2. Create house_commitments table
CREATE TABLE IF NOT EXISTS public.house_commitments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resident_id uuid REFERENCES public.residents(id) ON DELETE SET NULL,
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  bed_id uuid REFERENCES public.beds(id) ON DELETE SET NULL,
  payment_frequency text NOT NULL DEFAULT 'monthly' CHECK (payment_frequency IN ('weekly', 'monthly')),
  rent_amount numeric NOT NULL DEFAULT 800,
  admin_fee numeric NOT NULL DEFAULT 200,
  rent_due_date text NOT NULL DEFAULT '1st of each month',
  commitment_start_date date NOT NULL DEFAULT CURRENT_DATE,
  commitment_term text NOT NULL DEFAULT '181 days',
  property_location text,
  notes text,
  staff_signature text,
  staff_signed_at timestamptz,
  staff_signer_id uuid REFERENCES public.users(id),
  resident_signature text,
  resident_signed_at timestamptz,
  status text NOT NULL DEFAULT 'pending_resident_signature' CHECK (status IN ('pending_resident_signature', 'active', 'terminated')),
  pdf_storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. RLS for house_commitments
ALTER TABLE public.house_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read all commitments" ON public.house_commitments
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_staff());

CREATE POLICY "Users can read own commitments" ON public.house_commitments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Staff can insert commitments" ON public.house_commitments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_staff());

CREATE POLICY "Staff can update commitments" ON public.house_commitments
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_staff());

-- Allow residents to update their own commitment (for signing)
CREATE POLICY "Users can update own commitment signature" ON public.house_commitments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- 4. Update get_session_user to include commitment_signed
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
    'is_resident', coalesce(u.is_resident, false),
    'commitment_signed', coalesce(u.commitment_signed, false)
  )
  FROM public.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE u.id = p_user_id;
$$;
