-- Safety assessments — monthly house checklist captured by admin/manager.
-- Mirrors the paper "Self — Safety Assessment" form (checkboxes + signed
-- name + date). Completed assessments are rendered to a PDF and
-- linked into house_documents so they live alongside commitments /
-- receipts in the house Documents tab.

CREATE TABLE IF NOT EXISTS public.safety_assessments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  -- JSON snapshot of checklist answers keyed by section/item codes
  -- from src/lib/safety-checklist.ts. Stored rather than normalized
  -- so future versions of the form don't invalidate past records.
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  person_completing_name text NOT NULL,
  completed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  signature text NOT NULL,
  assessment_date date NOT NULL,
  notes text,
  document_id uuid REFERENCES public.house_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_assessments_house_date
  ON public.safety_assessments (house_id, assessment_date DESC);
CREATE INDEX IF NOT EXISTS idx_safety_assessments_created_at
  ON public.safety_assessments (created_at DESC);
