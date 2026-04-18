-- Migration: Add force_photo column to residents and photo_url to chore_signoffs
-- Run this in Supabase SQL Editor to update existing databases

-- Add force_photo boolean to residents
ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS force_photo boolean NOT NULL DEFAULT false;

-- Add photo_url to chore_signoffs for photo evidence
ALTER TABLE public.chore_signoffs
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Add missing DELETE policy on chore_signoffs (needed for rotate schedule and unassign)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chore_signoffs' AND policyname = 'Staff can delete signoffs'
  ) THEN
    CREATE POLICY "Staff can delete signoffs"
      ON public.chore_signoffs FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
        )
      );
  END IF;
END $$;
