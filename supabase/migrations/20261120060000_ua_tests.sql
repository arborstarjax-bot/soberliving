-- UA (urinalysis) randomizer rounds + per-resident results.
create table if not exists public.ua_tests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  house_id uuid references public.houses(id) on delete set null,
  count integer not null,
  status text not null default 'open',
  created_by uuid,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.ua_results (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.ua_tests(id) on delete cascade,
  resident_id uuid not null references public.residents(id) on delete cascade,
  result text not null default 'pending',
  photo_path text,
  created_at timestamptz not null default now(),
  unique (test_id, resident_id)
);

alter table public.ua_tests enable row level security;
alter table public.ua_results enable row level security;
create policy "ua_tests_select" on public.ua_tests
  for select to authenticated using (true);
create policy "ua_results_select" on public.ua_results
  for select to authenticated using (true);
