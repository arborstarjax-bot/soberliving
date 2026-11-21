-- Fix: Ensure user_id column exists on check_in_responses
-- Run this if the blocking redirect is not working

-- Add user_id column if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_in_responses' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE check_in_responses ADD COLUMN user_id uuid REFERENCES users(id);
  END IF;
END $$;

-- Backfill user_id from the resident record for any existing rows
UPDATE check_in_responses cr
SET user_id = r.user_id
FROM residents r
WHERE cr.resident_id = r.id
  AND cr.user_id IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE check_in_responses ALTER COLUMN user_id SET NOT NULL;

-- Recreate the index for fast pending lookup
CREATE INDEX IF NOT EXISTS idx_check_in_responses_pending
  ON check_in_responses (user_id, status) WHERE status = 'pending';

-- Verify: should return rows for pending check-ins
SELECT cr.id, cr.user_id, cr.status, r.full_name
FROM check_in_responses cr
JOIN residents r ON r.id = cr.resident_id
WHERE cr.status = 'pending';
