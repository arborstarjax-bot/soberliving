-- Track when each user last visited the Bulletin Board so the sidebar
-- can render an "unread posts" badge without requiring a per-post,
-- per-user read-receipt row. Count of unread posts = bulletin_posts
-- rows visible to the user with created_at > users.last_seen_bulletin_at
-- (NULL last_seen means "never visited" so every visible post counts).
alter table public.users
  add column if not exists last_seen_bulletin_at timestamptz;
