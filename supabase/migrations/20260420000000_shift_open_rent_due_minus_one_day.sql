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
-- Collision safety:
--   The unique index `uq_payment_charges_resident_due_type`
--   (resident_id, due_date, charge_type) would blow up if shifting
--   an open rent row (D+1) onto an already-paid rent row at D — e.g.
--   resident paid Jan rent at 2025-02-15, Feb rent sits open at
--   2025-03-15, and the shift would try to move Feb to 2025-03-14,
--   which is fine, but the same resident with consecutive cycles
--   can produce an open row one day after a historical row.
--
--   We avoid the collision in two phases inside a single
--   transaction:
--     Phase 1 — delete orphaned open/partial rent rows whose
--       commitment is no longer active (superseded / cancelled).
--       These are residue from pre-amendment charge openers and
--       would never be paid anyway; removing them eliminates the
--       most common collision source.
--     Phase 2 — shift remaining open/partial rent rows, but only
--       when (resident_id, due_date-1, 'rent') isn't already taken.
--       Rows that WOULD collide are left alone; a notice lists
--       their IDs so ops can investigate manually.
--
-- Idempotency: guarded via public.system_flags with key
--   'rent_due_date_shifted_minus_one'
-- so re-running the migration (e.g. in a staging rerun) is a
-- no-op. The guard row is inserted inside the same transaction
-- as the UPDATE so a failed UPDATE also rolls back the guard.
do $$
declare
  orphan_count   int;
  shifted_count  int;
  collision_rec record;
  collision_ids uuid[];
begin
  if exists (
    select 1 from public.system_flags
    where key = 'rent_due_date_shifted_minus_one'
  ) then
    raise notice 'rent_due_date_shifted_minus_one guard present — skipping';
    return;
  end if;

  -- Phase 1: drop orphaned open rent rows on non-active commitments.
  -- These are leftovers from pre-amendment charge openers that would
  -- never be paid anyway — keeping them just creates collision risk
  -- against historical paid rows on the same calendar day.
  with dropped as (
    delete from public.payment_charges pc
    using public.house_commitments hc
    where pc.charge_type = 'rent'
      and pc.status in ('open', 'partial')
      and pc.commitment_id = hc.id
      and hc.status in ('superseded', 'cancelled')
    returning pc.id
  )
  select count(*) into orphan_count from dropped;
  raise notice 'Dropped % orphaned open rent charges on non-active commitments', orphan_count;

  -- Phase 2: log collision candidates before attempting the shift so
  -- ops have a record if any rows are skipped. A collision is any
  -- open/partial rent row at due_date D where another rent row
  -- already exists at due_date D-1 for the same resident.
  select array_agg(pc.id order by pc.resident_id, pc.due_date)
    into collision_ids
    from public.payment_charges pc
    where pc.charge_type = 'rent'
      and pc.status in ('open', 'partial')
      and exists (
        select 1 from public.payment_charges other
        where other.resident_id = pc.resident_id
          and other.charge_type = 'rent'
          and other.due_date = pc.due_date - 1
          and other.id <> pc.id
      );

  if collision_ids is not null then
    raise notice 'Collision candidates (rows NOT shifted — existing rent row at D-1): %', collision_ids;
    for collision_rec in
      select pc.id, pc.resident_id, pc.due_date, pc.status
        from public.payment_charges pc
        where pc.id = any(collision_ids)
    loop
      raise notice '  skipped charge % resident % due % status %',
        collision_rec.id,
        collision_rec.resident_id,
        collision_rec.due_date,
        collision_rec.status;
    end loop;
  end if;

  -- The actual shift. NOT EXISTS guard leaves collision rows alone.
  update public.payment_charges pc
    set due_date = pc.due_date - 1
    where pc.charge_type = 'rent'
      and pc.status in ('open', 'partial')
      and not exists (
        select 1 from public.payment_charges other
        where other.resident_id = pc.resident_id
          and other.charge_type = 'rent'
          and other.due_date = pc.due_date - 1
          and other.id <> pc.id
      );

  get diagnostics shifted_count = row_count;
  raise notice 'Shifted % open/partial rent charges back by 1 day', shifted_count;

  insert into public.system_flags (key, updated_at)
    values ('rent_due_date_shifted_minus_one', now());
end $$;
