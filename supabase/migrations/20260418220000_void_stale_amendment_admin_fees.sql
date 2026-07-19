-- Void stale admin_fee charges that were opened against amendment
-- commitments before PR #56 taught `proposeAmendment` to set
-- `skip_initial_admin_fee = true`. Admin fee is a one-time move-in fee,
-- so any `admin_fee` charge opened against a commitment whose chain
-- already contains a paid admin fee is a duplicate and must not keep
-- the resident on the hook.
--
-- Logic:
--   * Target charges: open/partial admin_fee rows whose commitment is
--     an amendment (parent_commitment_id IS NOT NULL).
--   * Only void when a sibling admin_fee row for the same resident is
--     already in status 'paid' — i.e. the resident really did pay the
--     admin fee at some earlier point; we're just cleaning up a second
--     one the old code would've opened.
--
-- Idempotent: running twice is a no-op because the second pass finds
-- nothing in status 'open'/'partial'.

do $$
declare
  voided_count int;
begin
  with paid_admin_fee_residents as (
    select distinct resident_id
      from public.payment_charges
     where charge_type = 'admin_fee'
       and status = 'paid'
  ),
  stale as (
    select c.id
      from public.payment_charges c
      join public.house_commitments hc
        on hc.id = c.commitment_id
     where c.charge_type = 'admin_fee'
       and c.status in ('open', 'partial')
       and hc.parent_commitment_id is not null
       and c.resident_id in (select resident_id from paid_admin_fee_residents)
  )
  update public.payment_charges
     set status = 'void',
         note = coalesce(note || ' | ', '')
             || 'Voided by 20260418220000: duplicate admin fee on amendment (one-time move-in fee already paid).',
         updated_at = now()
   where id in (select id from stale);

  get diagnostics voided_count = row_count;
  raise notice 'Voided % stale amendment admin_fee charges', voided_count;
end $$;
