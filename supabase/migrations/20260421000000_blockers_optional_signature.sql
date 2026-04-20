-- Add per-notice toggle for whether residents must draw a signature
-- to acknowledge, or can just click Continue. Default true to
-- preserve prior behavior for any existing row.
ALTER TABLE public.blockers
  ADD COLUMN IF NOT EXISTS require_signature boolean NOT NULL DEFAULT true;

-- When require_signature is false, the acknowledgment row is still
-- inserted (for audit + target tracking) but no signature image is
-- captured. Relax the NOT NULL so the row can land without one.
ALTER TABLE public.blocker_acknowledgments
  ALTER COLUMN signature DROP NOT NULL;
