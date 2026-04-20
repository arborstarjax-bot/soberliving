-- Backfill the `restrictions_notes` column on public.house_commitments.
--
-- The commitment signing form, intake review, and edit-terms dialog
-- all persist per-commitment restrictions into this column, and the
-- resident detail page's activeCommitment query selects it alongside
-- rent/admin_fee/etc. In some environments the column was never
-- added, so PostgREST returns "column does not exist" for the whole
-- query and the caller silently sees no active commitment — which
-- hides the Payment Terms card, Edit Commitment Agreement button,
-- and Upcoming Rent card even for residents with a valid active
-- commitment row. Adding it idempotently here so every environment
-- converges.

alter table public.house_commitments
  add column if not exists restrictions_notes text;
