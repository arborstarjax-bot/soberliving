-- Workspace-scoped admin document vault. Documents uploaded here are
-- shared across the workspace's staff rather than tied to a resident.
alter table public.documents
  add column if not exists workspace_id uuid;
create index if not exists documents_workspace_idx
  on public.documents (workspace_id) where document_type = 'vault';
