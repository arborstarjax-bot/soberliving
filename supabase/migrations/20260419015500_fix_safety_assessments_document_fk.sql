-- Fix: safety_assessments.document_id FK referenced the wrong table in
-- prod (`public.documents` instead of `public.house_documents`). The
-- committed migration (20260418210000_add_safety_assessments.sql)
-- already references `house_documents`, but the SQL pasted manually
-- into prod referenced `documents`, so submitting a safety assessment
-- always fails with:
--
--   insert or update on table "safety_assessments" violates foreign
--   key constraint "safety_assessments_document_id_fkey"
--
-- This migration drops whatever FK is currently on document_id and
-- re-adds one that references house_documents(id). Idempotent.

alter table public.safety_assessments
  drop constraint if exists safety_assessments_document_id_fkey;

alter table public.safety_assessments
  add constraint safety_assessments_document_id_fkey
  foreign key (document_id)
  references public.house_documents(id)
  on delete set null;
