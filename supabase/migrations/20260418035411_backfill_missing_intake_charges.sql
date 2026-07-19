-- Backfill the admin-fee + first-cycle rent charges for every
-- commitment that was created WITHOUT collecting a move-in payment
-- and whose resident hasn't signed yet. Before April 2026 we only
-- pre-opened charges when the admin collected money at move-in; if
-- the admin ticked "No payment collected at move-in" no rows were
-- written and the resident showed $0 outstanding until they signed
-- their commitment. New intakes are pre-opened correctly now
-- (intake-review/actions.ts); this migration patches up anyone who
-- slipped through the old code path.
--
-- Safe to re-run: the ON CONFLICT clause uses the same unique index
-- (resident_id, due_date, charge_type) the app uses to dedupe
-- charges. Existing rows are left untouched.
--
-- Scope:
--   - status IN ('active', 'pending_resident_signature'). Cancelled
--     / replaced commitments are skipped.
--   - billing_anchor_date IS NULL. Existing-tenant activations
--     already set the anchor to a future date and intentionally do
--     NOT open a first-cycle rent charge, so we skip them.
--   - Only residents where NO open rent charge exists yet.

BEGIN;

-- Admin fee charges.
INSERT INTO payment_charges (
  resident_id,
  house_id,
  commitment_id,
  charge_type,
  amount,
  due_date
)
SELECT
  c.resident_id,
  c.house_id,
  c.id,
  'admin_fee',
  c.admin_fee,
  c.commitment_start_date
FROM house_commitments c
WHERE c.status IN ('active', 'pending_resident_signature')
  AND c.resident_id IS NOT NULL
  AND c.billing_anchor_date IS NULL
  AND COALESCE(c.skip_initial_admin_fee, false) = false
  AND c.admin_fee > 0
  AND NOT EXISTS (
    SELECT 1 FROM payment_charges existing
    WHERE existing.resident_id = c.resident_id
      AND existing.charge_type = 'admin_fee'
  )
ON CONFLICT (resident_id, due_date, charge_type) DO NOTHING;

-- First-cycle rent charges. period_end is one cycle after due_date:
-- +7 days for weekly cadence, +1 month (clamped) for monthly.
INSERT INTO payment_charges (
  resident_id,
  house_id,
  commitment_id,
  charge_type,
  amount,
  due_date,
  period_start,
  period_end
)
SELECT
  c.resident_id,
  c.house_id,
  c.id,
  'rent',
  c.rent_amount,
  c.commitment_start_date,
  c.commitment_start_date,
  CASE
    WHEN c.payment_frequency = 'weekly'
      THEN c.commitment_start_date + INTERVAL '7 days'
    ELSE c.commitment_start_date + INTERVAL '1 month'
  END
FROM house_commitments c
WHERE c.status IN ('active', 'pending_resident_signature')
  AND c.resident_id IS NOT NULL
  AND c.billing_anchor_date IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM payment_charges existing
    WHERE existing.resident_id = c.resident_id
      AND existing.charge_type = 'rent'
  )
ON CONFLICT (resident_id, due_date, charge_type) DO NOTHING;

COMMIT;
