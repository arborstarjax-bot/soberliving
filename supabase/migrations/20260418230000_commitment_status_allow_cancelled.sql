-- The original `house_commitments.status` CHECK constraint predates
-- the amendment workflow and does NOT include 'cancelled', even though
-- `cancelPendingAmendment` writes exactly that value. Every Cancel
-- click currently fails with:
--   new row for relation "house_commitments" violates check constraint
--   "house_commitments_status_check"
--
-- Broaden the constraint to cover every status the app actually uses:
-- the original intake/signing flow + amendments + administrative
-- terminations.

alter table public.house_commitments
  drop constraint if exists house_commitments_status_check;

alter table public.house_commitments
  add constraint house_commitments_status_check
  check (status in (
    'pending_staff_signature',
    'pending_resident_signature',
    'active',
    'superseded',
    'cancelled',
    'terminated',
    'void'
  ));
