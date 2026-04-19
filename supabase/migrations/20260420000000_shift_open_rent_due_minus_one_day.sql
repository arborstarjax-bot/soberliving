-- One-shot migration: shift every currently-open/partial rent charge's
-- due_date back by one day, to align existing data with the new policy
-- that rent is due the day BEFORE the cycle anchor (see
-- `RENT_DUE_OFFSET_DAYS` in src/lib/payments/charges.ts).
--
-- Scope:
--   • charge_type = 'rent' only. Admin fees, deposits, and misc
--     charges keep their existing due_date (admin fee is due on
--     commitment_start_date, unchanged).
--   • status IN ('open', 'partial') only. Paid/void rent rows are
--     historical facts referenced by receipts and stay untouched.
--   • period_start / period_end are NOT modified — the "period"
--     that the charge covers still starts on the anchor (== the
--     pre-shift due_date for existing rows). Only the collection
--     deadline (due_date) moves back a day.
--
-- Idempotency: guarded via public.system_flags with key
--   'rent_due_date_shifted_minus_one'
-- so re-running the migration (e.g. in a staging rerun) is a
-- no-op. The guard row is inserted inside the same transaction
-- as the UPDATE so a failed UPDATE also rolls back the guard.
do $$
declare
  shifted_count int;
begin
  if exists (
    select 1 from public.system_flags
    where key = 'rent_due_date_shifted_minus_one'
  ) then
    raise notice 'rent_due_date_shifted_minus_one guard present — skipping';
    return;
  end if;

  update public.payment_charges
    set due_date = due_date - 1
    where charge_type = 'rent'
      and status in ('open', 'partial');

  get diagnostics shifted_count = row_count;
  raise notice 'Shifted % open/partial rent charges back by 1 day', shifted_count;

  insert into public.system_flags (key, updated_at)
    values ('rent_due_date_shifted_minus_one', now());
end $$;
