-- Migration: Existing-tenant activation support
--
-- Adds two optional fields on `house_commitments` used when an admin
-- activates an intake as an "existing tenant" (already living in the
-- house, already caught up on rent):
--
--   billing_anchor_date   — if set, rent charges open anchored to
--                           this date instead of commitment_start_date.
--                           Used when the first rent the resident owes
--                           under the new commitment is in the future.
--   skip_initial_admin_fee — if true, the admin_fee startup charge is
--                           NOT created (the admin marked the fee as
--                           already collected or not owed).
--
-- Both default to null / false so existing commitments keep their
-- current behaviour.

ALTER TABLE public.house_commitments
  ADD COLUMN IF NOT EXISTS billing_anchor_date date,
  ADD COLUMN IF NOT EXISTS skip_initial_admin_fee boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.house_commitments.billing_anchor_date IS
  'Overrides commitment_start_date as the rent-cycle anchor. Set when activating an existing tenant whose first rent under this commitment is on a future date.';
COMMENT ON COLUMN public.house_commitments.skip_initial_admin_fee IS
  'When true, openStartupChargesForCommitment() does not create the admin_fee charge. Used for existing-tenant activations where the admin fee was already collected or waived.';
