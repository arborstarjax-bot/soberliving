-- Migration: Add notes and photo_url columns to demerits and incidents tables
-- Run this in Supabase SQL Editor after the previous migrations

-- Add notes column to demerits table
ALTER TABLE public.demerits
  ADD COLUMN IF NOT EXISTS notes text;

-- Add photo_url column to demerits table
ALTER TABLE public.demerits
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Add photo_url column to incidents table
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Add rejection_note column to chore_signoffs table (for chore verification rejections)
ALTER TABLE public.chore_signoffs
  ADD COLUMN IF NOT EXISTS rejection_note text;
