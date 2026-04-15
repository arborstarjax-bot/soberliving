-- Jax Sober Living: Bulletin Board Migration
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.bulletin_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.bulletin_posts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read posts
CREATE POLICY "Authenticated users can read bulletin posts" ON public.bulletin_posts
  FOR SELECT TO authenticated
  USING (true);

-- All authenticated users can create posts
CREATE POLICY "Authenticated users can create bulletin posts" ON public.bulletin_posts
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Users can update their own posts, admins can update any
CREATE POLICY "Users can update own posts or admin any" ON public.bulletin_posts
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_admin())
  WITH CHECK (author_id = auth.uid() OR public.is_admin());

-- Users can delete their own posts, admins can delete any
CREATE POLICY "Users can delete own posts or admin any" ON public.bulletin_posts
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_admin());
