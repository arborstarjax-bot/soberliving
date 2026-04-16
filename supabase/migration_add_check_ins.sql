-- Migration: Add Check-In tables for monthly resident check-ins
-- Run this in Supabase SQL Editor

-- 1. Check-in batches (tracks each "send check-in" action by staff)
CREATE TABLE IF NOT EXISTS check_in_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id),
  house_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE check_in_batches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'check_in_batches' AND policyname = 'check_in_batches_select') THEN
    CREATE POLICY check_in_batches_select ON check_in_batches FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'check_in_batches' AND policyname = 'check_in_batches_insert') THEN
    CREATE POLICY check_in_batches_insert ON check_in_batches FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 2. Check-in responses (one row per resident per check-in)
CREATE TABLE IF NOT EXISTS check_in_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES check_in_batches(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  house_id uuid NOT NULL REFERENCES houses(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  form_data jsonb,
  staff_signature text,
  staff_signed_by uuid REFERENCES users(id),
  completed_at timestamptz,
  pdf_storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE check_in_responses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'check_in_responses' AND policyname = 'check_in_responses_select') THEN
    CREATE POLICY check_in_responses_select ON check_in_responses FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'check_in_responses' AND policyname = 'check_in_responses_insert') THEN
    CREATE POLICY check_in_responses_insert ON check_in_responses FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'check_in_responses' AND policyname = 'check_in_responses_update') THEN
    CREATE POLICY check_in_responses_update ON check_in_responses FOR UPDATE USING (true);
  END IF;
END $$;

-- Fast lookup for the blocking check in dashboard layout
CREATE INDEX IF NOT EXISTS idx_check_in_responses_pending
  ON check_in_responses (user_id, status) WHERE status = 'pending';

-- Index for listing by batch
CREATE INDEX IF NOT EXISTS idx_check_in_responses_batch
  ON check_in_responses (batch_id);

-- Index for resident document history
CREATE INDEX IF NOT EXISTS idx_check_in_responses_resident
  ON check_in_responses (resident_id, created_at DESC);
