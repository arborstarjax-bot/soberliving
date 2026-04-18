"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { generateSafetyAssessmentPdf } from "@/lib/safety-pdf";
import { formatDateOnly } from "@/lib/timezone";
import type { SafetyChecklistResponses } from "@/lib/safety-checklist";

const HOUSE_DOCS_BUCKET = "house-documents";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface SubmitSafetyAssessmentInput {
  houseId: string;
  assessmentDate: string; // YYYY-MM-DD
  personCompletingName: string;
  signature: string; // data:image/png;base64,...
  checklist: SafetyChecklistResponses;
  notes: string | null;
}

/**
 * Submit a completed safety assessment for a house.
 *
 * - Renders the checklist + signature to a single PDF
 * - Stores the PDF under the existing `house-documents` bucket so it
 *   shows up alongside commitments / receipts in the house Documents
 *   tab
 * - Inserts a `house_documents` row linking the PDF
 * - Inserts a `safety_assessments` row referencing the document
 *
 * Access: admin or manager for the given house.
 */
export async function submitSafetyAssessment(
  input: SubmitSafetyAssessmentInput
) {
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }
  if (user.role !== "admin" && !canAccessHouse(user, input.houseId)) {
    return { error: "Not authorized for this house" };
  }

  const personName = input.personCompletingName.trim();
  if (!personName) return { error: "Person completing is required" };
  if (!ISO_DATE.test(input.assessmentDate)) {
    return { error: "Invalid assessment date" };
  }
  if (!input.signature || !input.signature.startsWith("data:image/")) {
    return { error: "Signature is required" };
  }

  const admin = createAdminClient();

  const { data: house } = await admin
    .from("houses")
    .select("id, name, address")
    .eq("id", input.houseId)
    .maybeSingle();
  if (!house) return { error: "House not found" };

  const pdfBytes = await generateSafetyAssessmentPdf({
    houseName: (house.name as string) ?? "",
    houseAddress: (house.address as string | null) ?? null,
    assessmentDate: formatDateOnly(input.assessmentDate),
    personCompletingName: personName,
    checklist: input.checklist,
    notes: input.notes,
    signatureDataUrl: input.signature,
  });

  const safeDate = input.assessmentDate.replace(/-/g, "");
  const objectPath = `${input.houseId}/safety-${safeDate}-${Date.now()}.pdf`;
  // Convert Uint8Array to a Buffer because Supabase Storage's
  // serverless client rejects Uint8Array payloads when running under
  // edge runtimes.
  const body = Buffer.from(pdfBytes);
  const { error: uploadError } = await admin.storage
    .from(HOUSE_DOCS_BUCKET)
    .upload(objectPath, body, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) return { error: uploadError.message };

  const docName = `Safety Assessment — ${formatDateOnly(input.assessmentDate)}`;
  const { data: doc, error: docError } = await admin
    .from("house_documents")
    .insert({
      house_id: input.houseId,
      name: docName,
      description: `Completed by ${personName}`,
      file_path: objectPath,
      mime_type: "application/pdf",
      size_bytes: body.byteLength,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (docError || !doc) {
    await admin.storage.from(HOUSE_DOCS_BUCKET).remove([objectPath]);
    return { error: docError?.message ?? "Failed to save document" };
  }

  const { data: assessment, error: assessmentError } = await admin
    .from("safety_assessments")
    .insert({
      house_id: input.houseId,
      checklist: input.checklist,
      person_completing_name: personName,
      completed_by: user.id,
      signature: input.signature,
      assessment_date: input.assessmentDate,
      notes: input.notes?.trim() ? input.notes.trim() : null,
      document_id: doc.id,
    })
    .select("id")
    .single();
  if (assessmentError || !assessment) {
    await admin.from("house_documents").delete().eq("id", doc.id);
    await admin.storage.from(HOUSE_DOCS_BUCKET).remove([objectPath]);
    return { error: assessmentError?.message ?? "Failed to save assessment" };
  }

  await logActivity({
    houseId: input.houseId,
    actorId: user.id,
    eventType: "safety_assessment_completed",
    entityType: "safety_assessment",
    entityId: assessment.id as string,
    description: `${user.full_name} completed a safety assessment`,
  });

  revalidatePath(`/houses/${input.houseId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
