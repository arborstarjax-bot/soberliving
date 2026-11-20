-- Who gives the final approval on an overnight pass:
-- 'manager' (house manager only), 'admin' (admin only), or 'both'
-- (house manager, then admin — the previous fixed pipeline).
alter table public.workspace_settings
  add column if not exists pass_approver text not null default 'both'
  check (pass_approver in ('manager', 'admin', 'both'));
