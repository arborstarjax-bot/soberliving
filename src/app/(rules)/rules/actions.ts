"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { generateRulesAcknowledgmentPdf } from "./generate-rules-pdf";
import { buildRulesSlides } from "./rules-content";
import {
  getWorkspaceForUser,
  getWorkspace,
  getWorkspaceSettings,
} from "@/lib/workspace";

export async function submitRulesAcknowledgment(signatureDataUrl: string) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  if (!signatureDataUrl) {
    return { error: "Signature is required" };
  }

  // Rebuild the same deck the resident saw so the signed acknowledgment
  // records the workspace's actual rules (custom sheet or named deck).
  const membership = await getWorkspaceForUser(user.id);
  const [workspace, settings] = membership
    ? await Promise.all([
        getWorkspace(membership.workspace_id),
        getWorkspaceSettings(membership.workspace_id),
      ])
    : [null, null];
  const houseName = workspace?.name ?? "the house";
  const slides = buildRulesSlides(houseName, settings?.rules_text);

  // Generate full PDF with all rules content + resident signature
  const pdfBuffer = await generateRulesAcknowledgmentPdf(
    user.full_name,
    signatureDataUrl,
    { slides, houseName }
  );

  // Upload PDF to Supabase Storage
  const pdfPath = `${user.id}/rules-acknowledgment-${Date.now()}.pdf`;
  const { error: uploadError } = await adminClient.storage
    .from("documents")
    .upload(pdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    console.error("[submitRulesAcknowledgment] PDF upload failed:", uploadError.message);
    return { error: "Failed to save acknowledgment document" };
  }

  // Create document record for the rules acknowledgment
  const { error: docError } = await adminClient.from("documents").insert({
    user_id: user.id,
    name: "House Rules Acknowledgment",
    document_type: "rules_acknowledgment",
    storage_path: pdfPath,
    file_size: pdfBuffer.length,
  });

  if (docError) {
    console.error("[submitRulesAcknowledgment] doc insert failed:", docError.message);
  }

  // Mark rules as acknowledged
  const { error: updateError } = await adminClient
    .from("users")
    .update({
      rules_acknowledged: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  await logActivity({
    actorId: user.id,
    eventType: "rules_acknowledged",
    entityType: "user",
    entityId: user.id,
    description: `${user.full_name} acknowledged house rules`,
  });

  revalidatePath("/dashboard");
  return {};
}
