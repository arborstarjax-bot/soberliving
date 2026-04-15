-- Migration: Add force_photo column to residents and photo_url to chore_signoffs
-- Run this in Supabase SQL Editor to update existing databases

-- Add force_photo boolean to residents
ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS force_photo boolean NOT NULL DEFAULT false;

-- Add photo_url to chore_signoffs for photo evidence
ALTER TABLE public.chore_signoffs
  ADD COLUMN IF NOT EXISTS photo_url text;
