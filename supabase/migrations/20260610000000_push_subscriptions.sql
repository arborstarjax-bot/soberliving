-- Push notification subscriptions (Web Push API).
-- Each row represents one browser/device endpoint for a user.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Index for fanout: find all devices for a given user quickly.
create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);

-- Per-user push notification preferences.
-- Columns live on the existing users table so preferences travel
-- with the user and don't need a separate join.
alter table public.users
  add column if not exists push_chores boolean not null default true,
  add column if not exists push_bulletin boolean not null default true,
  add column if not exists push_discipline boolean not null default true;

-- RLS: users can only manage their own subscriptions.
alter table public.push_subscriptions enable row level security;

create policy "Users can view own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
