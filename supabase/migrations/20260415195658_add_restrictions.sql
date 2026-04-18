-- Migration: Add restrictions table for discipline/house commitment restrictions
-- Run this in Supabase SQL Editor after the previous migrations

-- Create restrictions table
CREATE TABLE IF NOT EXISTS public.restrictions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  restriction_type text NOT NULL DEFAULT 'custom',
  description text NOT NULL,
  notes text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  is_house_commitment boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add check constraint for restriction_type
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restrictions_type_check'
  ) THEN
    ALTER TABLE public.restrictions
      ADD CONSTRAINT restrictions_type_check
      CHECK (restriction_type IN ('no_leave', 'weekend_restriction', 'house_commitment', 'curfew', 'custom'));
  END IF;
END $$;

-- Create index for active restrictions lookup
CREATE INDEX IF NOT EXISTS idx_restrictions_active
  ON public.restrictions (resident_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_restrictions_end_date
  ON public.restrictions (end_date)
  WHERE is_active = true AND end_date IS NOT NULL;

-- RLS policies
ALTER TABLE public.restrictions ENABLE ROW LEVEL SECURITY;

-- Staff can read all restrictions for accessible houses
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'restrictions_select_policy'
  ) THEN
    CREATE POLICY restrictions_select_policy ON public.restrictions
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Staff can insert restrictions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'restrictions_insert_policy'
  ) THEN
    CREATE POLICY restrictions_insert_policy ON public.restrictions
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- Staff can update restrictions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'restrictions_update_policy'
  ) THEN
    CREATE POLICY restrictions_update_policy ON public.restrictions
      FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;

-- Staff can delete restrictions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'restrictions_delete_policy'
  ) THEN
    CREATE POLICY restrictions_delete_policy ON public.restrictions
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;
