-- Migration: Add days_of_week and cycle_weeks to chores table
-- Run this in Supabase SQL Editor to update existing databases

-- Add new columns to chores
ALTER TABLE public.chores
  ADD COLUMN IF NOT EXISTS days_of_week text[] NOT NULL DEFAULT '{monday,wednesday,friday}';

ALTER TABLE public.chores
  ADD COLUMN IF NOT EXISTS cycle_weeks integer NOT NULL DEFAULT 2;

-- Add check constraint for cycle_weeks
ALTER TABLE public.chores
  ADD CONSTRAINT chores_cycle_weeks_check CHECK (cycle_weeks BETWEEN 1 AND 4);

-- Update day_of_week constraint on chore_signoffs to allow all 7 days
ALTER TABLE public.chore_signoffs
  DROP CONSTRAINT IF EXISTS chore_signoffs_day_of_week_check;

ALTER TABLE public.chore_signoffs
  ADD CONSTRAINT chore_signoffs_day_of_week_check
  CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'));

-- Update week_number constraint to allow up to 4 weeks
ALTER TABLE public.chore_signoffs
  DROP CONSTRAINT IF EXISTS chore_signoffs_week_number_check;

ALTER TABLE public.chore_signoffs
  ADD CONSTRAINT chore_signoffs_week_number_check
  CHECK (week_number BETWEEN 1 AND 4);
