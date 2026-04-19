-- Migration: enforce at most one active bed assignment per bed
-- ------------------------------------------------------------------
-- `bed_assignments` uses `end_date IS NULL` to mean "currently
-- occupied". The application (assignBed / changeResidentBed in
-- src/app/(dashboard)/residents/actions.ts) does a SELECT + INSERT
-- check-then-act, which has a TOCTOU race: two staff users assigning
-- the same bed simultaneously can both pass the "is this bed free?"
-- check and both insert active rows, double-booking the bed.
--
-- This partial unique index guarantees at most one active
-- assignment per bed at the DB level; the application catches the
-- 23505 unique violation and returns a friendly "already occupied"
-- message instead of a raw error.
--
-- Backfill note: if historical data contains bed_ids with more than
-- one end_date=NULL row today, this CREATE INDEX will fail. The
-- following SELECT surfaces any such duplicates; if it returns
-- rows, those assignments must be reconciled (e.g. closing the
-- older row) before this migration can apply:
--
--   SELECT bed_id, count(*)
--   FROM public.bed_assignments
--   WHERE end_date IS NULL
--   GROUP BY bed_id
--   HAVING count(*) > 1;

create unique index if not exists idx_bed_assignments_one_active_per_bed
  on public.bed_assignments (bed_id)
  where end_date is null;
