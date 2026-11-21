-- Intake pipeline: per-workspace join mode, custom checklist steps,
-- rules sheet, and intake acknowledgments for vault documents.
alter table public.workspace_settings
  add column if not exists intake_mode text not null default 'requires_signoff',
  add column if not exists intake_steps jsonb not null default '[]'::jsonb,
  add column if not exists rules_text text,
  add column if not exists rules_document_id uuid,
  add column if not exists require_rule_checkoff boolean not null default false;

-- Vault documents can require an intake acknowledgment (sign & confirm).
alter table public.documents
  add column if not exists requires_intake_ack boolean not null default false;

-- A resident's signed acknowledgment of a document (rules sheet, etc).
create table if not exists public.document_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null,
  signature text not null,
  acknowledged_at timestamptz not null default now(),
  unique (document_id, user_id)
);
alter table public.document_acknowledgments enable row level security;
create policy "doc_acks_select" on public.document_acknowledgments
  for select to authenticated using (true);

-- Checkmarks on the workspace's custom intake steps.
create table if not exists public.intake_checkoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid not null,
  step_id text not null,
  checked_at timestamptz not null default now(),
  unique (user_id, workspace_id, step_id)
);
alter table public.intake_checkoffs enable row level security;
create policy "intake_checkoffs_select" on public.intake_checkoffs
  for select to authenticated using (true);
