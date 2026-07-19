-- Migration: Set app timezone to US/Eastern.
--
-- The app is operated out of the US East coast. Previously the default
-- house timezone was "America/Los_Angeles" (see migration_chore_improvements.sql),
-- which caused chore due-dates, missed-chore cutoffs and restriction expiries
-- to flip over at midnight Pacific instead of midnight Eastern.
--
-- This migration:
--   1. Changes the DEFAULT for houses.timezone to "America/New_York".
--   2. Retcons every existing row that was left on the old default.
--
-- Safe to re-run.

ALTER TABLE public.houses
  ALTER COLUMN timezone SET DEFAULT 'America/New_York';

UPDATE public.houses
SET timezone = 'America/New_York'
WHERE timezone = 'America/Los_Angeles';
