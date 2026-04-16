-- Add discharge_reason column to residents table
-- Safe to re-run (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'residents'
      AND column_name = 'discharge_reason'
  ) THEN
    ALTER TABLE public.residents ADD COLUMN discharge_reason text;
  END IF;
END $$;
