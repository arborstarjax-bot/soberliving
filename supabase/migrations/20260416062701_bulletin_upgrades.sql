-- Migration: Bulletin Board Upgrades
-- Adds house scoping, likes, comments, photo uploads to bulletin posts

-- 1. Add house_id and photo_url columns to bulletin_posts
ALTER TABLE bulletin_posts ADD COLUMN IF NOT EXISTS house_id uuid REFERENCES houses(id);
ALTER TABLE bulletin_posts ADD COLUMN IF NOT EXISTS photo_url text;

-- 2. Create bulletin_likes table
CREATE TABLE IF NOT EXISTS bulletin_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES bulletin_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- 3. Create bulletin_comments table
CREATE TABLE IF NOT EXISTS bulletin_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES bulletin_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bulletin_likes_post_id ON bulletin_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_bulletin_comments_post_id ON bulletin_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_bulletin_posts_house_id ON bulletin_posts(house_id);

-- 5. RLS policies for bulletin_likes
ALTER TABLE bulletin_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all likes" ON bulletin_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own likes" ON bulletin_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own likes" ON bulletin_likes
  FOR DELETE USING (auth.uid() = user_id);

-- 6. RLS policies for bulletin_comments
ALTER TABLE bulletin_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all comments" ON bulletin_comments
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own comments" ON bulletin_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" ON bulletin_comments
  FOR DELETE USING (auth.uid() = user_id);
