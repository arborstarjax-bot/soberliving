-- Migration: Add chore_completions table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.chore_completions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chore_id uuid NOT NULL REFERENCES public.chores(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  completion_date date NOT NULL,
  photo_url text,
  status text NOT NULL DEFAULT 'completed',
  completed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one completion per chore per resident per day
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chore_completions_chore_resident_date_unique'
  ) THEN
    ALTER TABLE public.chore_completions
      ADD CONSTRAINT chore_completions_chore_resident_date_unique
      UNIQUE (chore_id, resident_id, completion_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chore_completions_chore
  ON public.chore_completions (chore_id);

CREATE INDEX IF NOT EXISTS idx_chore_completions_resident
  ON public.chore_completions (resident_id);

CREATE INDEX IF NOT EXISTS idx_chore_completions_date
  ON public.chore_completions (completion_date);

-- RLS policies
ALTER TABLE public.chore_completions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_completions_select_policy'
  ) THEN
    CREATE POLICY chore_completions_select_policy ON public.chore_completions
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_completions_insert_policy'
  ) THEN
    CREATE POLICY chore_completions_insert_policy ON public.chore_completions
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_completions_update_policy'
  ) THEN
    CREATE POLICY chore_completions_update_policy ON public.chore_completions
      FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;
