-- Migration: Sobriety milestone auto-congrats log
-- ------------------------------------------------------------------
-- When a resident crosses a sobriety milestone (30 / 60 / 90 days,
-- 6 / 9 months, 1+ year, then every subsequent year) we post a
-- celebratory bulletin post to their house. This table is the
-- de-dup log — UNIQUE (resident_user_id, milestone_days) ensures
-- we only ever post once per resident per milestone, even across
-- concurrent renders.

create table if not exists public.sobriety_milestone_posts (
  id uuid primary key default gen_random_uuid(),
  resident_user_id uuid not null references public.users(id) on delete cascade,
  milestone_days int not null,
  bulletin_post_id uuid references public.bulletin_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (resident_user_id, milestone_days)
);

create index if not exists idx_sobriety_milestone_posts_user
  on public.sobriety_milestone_posts (resident_user_id);

alter table public.sobriety_milestone_posts enable row level security;

drop policy if exists "sobriety_milestone_posts_select" on public.sobriety_milestone_posts;
create policy "sobriety_milestone_posts_select"
  on public.sobriety_milestone_posts for select to authenticated using (true);
