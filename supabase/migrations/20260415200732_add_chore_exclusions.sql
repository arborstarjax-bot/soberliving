-- Migration: Add chore_exclusions table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.chore_exclusions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chore_id uuid NOT NULL REFERENCES public.chores(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: a resident can only be excluded from a chore once
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chore_exclusions_chore_resident_unique'
  ) THEN
    ALTER TABLE public.chore_exclusions
      ADD CONSTRAINT chore_exclusions_chore_resident_unique
      UNIQUE (chore_id, resident_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chore_exclusions_chore
  ON public.chore_exclusions (chore_id);

CREATE INDEX IF NOT EXISTS idx_chore_exclusions_resident
  ON public.chore_exclusions (resident_id);

-- RLS policies
ALTER TABLE public.chore_exclusions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_exclusions_select_policy'
  ) THEN
    CREATE POLICY chore_exclusions_select_policy ON public.chore_exclusions
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_exclusions_insert_policy'
  ) THEN
    CREATE POLICY chore_exclusions_insert_policy ON public.chore_exclusions
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_exclusions_delete_policy'
  ) THEN
    CREATE POLICY chore_exclusions_delete_policy ON public.chore_exclusions
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;
