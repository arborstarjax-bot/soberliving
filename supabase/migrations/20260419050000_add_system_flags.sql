-- system_flags is a tiny key/timestamp table used for cross-process
-- debounce of idempotent background scans (e.g. the milestone post
-- scan in ensureMilestonePosts). A module-global in-memory debounce
-- is per-lambda-process, so on serverless cold starts every fresh
-- instance runs the full residents→milestones scan once before the
-- idempotent UNIQUE constraint saves us. Moving the debounce into
-- the DB gives us a single source of truth across all processes.
--
-- Usage pattern (compare-and-swap):
--
--   insert into public.system_flags (key, updated_at)
--   values ('milestone_scan_last_run_at', now())
--   on conflict (key) do update
--     set updated_at = excluded.updated_at
--     where public.system_flags.updated_at < now() - interval '1 minute'
--   returning key;
--
-- If the returned row set is empty, another process owns the scan
-- window and the caller should bail. Otherwise the caller owns it.
create table if not exists public.system_flags (
  key text primary key,
  updated_at timestamptz not null default now()
);

-- No RLS policies — only the service role (createAdminClient) writes
-- here, and we never expose it to end users. RLS stays off.
alter table public.system_flags enable row level security;

-- claim_debounce_slot returns true if the caller won the debounce
-- window for `p_key` (i.e. nobody else has touched it in the last
-- `p_interval`), false if someone else already owns it. Implemented
-- as an atomic UPSERT so concurrent callers race safely at the row
-- lock; only one gets RETURNING.
create or replace function public.claim_debounce_slot(
  p_key text,
  p_interval interval
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  insert into public.system_flags (key, updated_at)
  values (p_key, now())
  on conflict (key) do update
    set updated_at = excluded.updated_at
    where public.system_flags.updated_at < now() - p_interval
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

-- Only the service role needs to call this. (authenticated + anon
-- roles are blocked by default on SECURITY DEFINER functions in
-- public schema under Supabase's hardened config; we revoke
-- explicitly for safety.)
revoke all on function public.claim_debounce_slot(text, interval) from public;
revoke all on function public.claim_debounce_slot(text, interval) from anon, authenticated;
grant execute on function public.claim_debounce_slot(text, interval) to service_role;
