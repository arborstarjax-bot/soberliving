-- Stripe billing for workspaces. Tiers gate the active-house count;
-- status is synced from Stripe webhooks. Existing workspaces get NULL
-- tier/status = grandfathered (unlimited, no banner) until they buy.
alter table public.workspaces
  add column if not exists subscription_tier text,
  add column if not exists subscription_status text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists trial_ends_at timestamptz;

create unique index if not exists workspaces_stripe_customer_id_key
  on public.workspaces (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column public.workspaces.subscription_tier is
  'solo | house | org — NULL = pre-billing workspace (unlimited)';
comment on column public.workspaces.subscription_status is
  'trialing | active | past_due | canceled | NULL = grandfathered';
