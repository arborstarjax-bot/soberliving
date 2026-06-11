"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function submitRulesAcknowledgment(signatureDataUrl: string) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  if (!signatureDataUrl) {
    return { error: "Signature is required" };
  }

  // Convert signature data URL to buffer for storage
  const base64Data = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
  const signatureBuffer = Buffer.from(base64Data, "base64");

  // Store signature image
  const sigPath = `${user.id}/rules-acknowledgment-signature-${Date.now()}.png`;
  await adminClient.storage
    .from("documents")
    .upload(sigPath, signatureBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  // Create document record for the rules acknowledgment
  const { error: docError } = await adminClient.from("documents").insert({
    user_id: user.id,
    name: "House Rules Acknowledgment",
    document_type: "rules_acknowledgment",
    storage_path: sigPath,
    file_size: signatureBuffer.length,
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
