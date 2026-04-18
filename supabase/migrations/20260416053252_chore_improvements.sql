-- Migration: Chore Improvements (Phase 1-6)
-- Adds timezone support, per-chore photo requirements, completion notes,
-- signoff_id FK on demerits, and fixes chore_signoffs RLS policy.

-- 1. Add timezone column to houses table
ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Los_Angeles';

-- 2. Add requires_photo flag to chores table (per-chore photo requirement)
ALTER TABLE public.chores
  ADD COLUMN IF NOT EXISTS requires_photo boolean NOT NULL DEFAULT false;

-- 3. Add completion_note column to chore_signoffs table
ALTER TABLE public.chore_signoffs
  ADD COLUMN IF NOT EXISTS completion_note text;

-- 4. Add signoff_id FK to demerits table (links auto-demerits to missed signoffs)
ALTER TABLE public.demerits
  ADD COLUMN IF NOT EXISTS signoff_id uuid UNIQUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'demerits_signoff_id_fkey'
  ) THEN
    ALTER TABLE public.demerits
      ADD CONSTRAINT demerits_signoff_id_fkey
      FOREIGN KEY (signoff_id) REFERENCES public.chore_signoffs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_demerits_signoff_id
  ON public.demerits (signoff_id)
  WHERE signoff_id IS NOT NULL;

-- 5. Fix chore_signoffs RLS policy
-- Allow residents to update their own signoffs (for marking complete / redo after rejection)
DO $$
BEGIN
  -- Drop and recreate the update policy to ensure residents can update their own signoffs
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_signoffs_update_policy'
  ) THEN
    DROP POLICY chore_signoffs_update_policy ON public.chore_signoffs;
  END IF;

  CREATE POLICY chore_signoffs_update_policy ON public.chore_signoffs
    FOR UPDATE USING (
      -- Staff (admin/manager) can update any signoff
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'manager')
      )
      OR
      -- Residents can update their own signoffs (via rotation assignment → resident)
      EXISTS (
        SELECT 1 FROM public.chore_rotation_assignments cra
        JOIN public.residents r ON r.id = cra.resident_id
        WHERE cra.id = chore_signoffs.rotation_assignment_id
          AND r.user_id = auth.uid()
      )
    );
END $$;

-- 6. Ensure residents can SELECT their own signoffs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_signoffs_select_policy'
  ) THEN
    CREATE POLICY chore_signoffs_select_policy ON public.chore_signoffs
      FOR SELECT USING (true);
  END IF;
END $$;
