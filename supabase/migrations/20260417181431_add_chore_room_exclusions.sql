-- Migration: Add chore_room_exclusions table
-- Lets staff exclude an entire room from a chore's rotation/auto-assignment.
-- Any resident currently bedded in an excluded room will be skipped when the
-- rotation shuffles and can't be manually assigned to the chore either.
--
-- Run this in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.chore_room_exclusions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chore_id uuid NOT NULL REFERENCES public.chores(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A room can only be excluded from a chore once.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chore_room_exclusions_chore_room_unique'
  ) THEN
    ALTER TABLE public.chore_room_exclusions
      ADD CONSTRAINT chore_room_exclusions_chore_room_unique
      UNIQUE (chore_id, room_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chore_room_exclusions_chore
  ON public.chore_room_exclusions (chore_id);

CREATE INDEX IF NOT EXISTS idx_chore_room_exclusions_room
  ON public.chore_room_exclusions (room_id);

-- RLS policies (mirror chore_exclusions so managers/admins can read+write
-- per their existing house access).
ALTER TABLE public.chore_room_exclusions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_room_exclusions_select_policy'
  ) THEN
    CREATE POLICY chore_room_exclusions_select_policy ON public.chore_room_exclusions
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_room_exclusions_insert_policy'
  ) THEN
    CREATE POLICY chore_room_exclusions_insert_policy ON public.chore_room_exclusions
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chore_room_exclusions_delete_policy'
  ) THEN
    CREATE POLICY chore_room_exclusions_delete_policy ON public.chore_room_exclusions
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;
