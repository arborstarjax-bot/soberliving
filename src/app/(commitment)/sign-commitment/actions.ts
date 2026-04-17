"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { openAllChargesForCommitment } from "@/lib/payments/charges";

export async function getCommitmentForResident() {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  const { data: commitment } = await adminClient
    .from("house_commitments")
    .select("*, houses(name, address)")
    .eq("user_id", user.id)
    .eq("status", "pending_resident_signature")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return commitment;
}

export async function signCommitment(
  commitmentId: string,
  residentSignature: string,
  pdfBase64: string
) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  // Verify this commitment belongs to the user
  const { data: commitment } = await adminClient
    .from("house_commitments")
    .select("id, user_id, status")
    .eq("id", commitmentId)
    .eq("user_id", user.id)
    .eq("status", "pending_resident_signature")
    .single();

  if (!commitment) {
    return { error: "Commitment not found or already signed" };
  }

  // Mark commitment_signed on user FIRST — if this fails the commitment
  // stays pending_resident_signature and the user can retry.
  const { error: userError } = await adminClient
    .from("users")
    .update({
      commitment_signed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (userError) {
    return { error: userError.message };
  }

  // Update commitment with resident signature
  const { error: updateError } = await adminClient
    .from("house_commitments")
    .update({
      resident_signature: residentSignature,
      resident_signed_at: new Date().toISOString(),
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", commitmentId);

  if (updateError) {
    // Revert user flag since commitment update failed
    const { error: revertError } = await adminClient
      .from("users")
      .update({ commitment_signed: false, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (revertError) {
      console.error("CRITICAL: Failed to revert commitment_signed flag for user", user.id, revertError.message);
    }
    return { error: updateError.message };
  }

  // Upload signed PDF
  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  const fileName = `${user.id}/house-commitment-${Date.now()}.pdf`;

  const { error: uploadError } = await adminClient.storage
    .from("documents")
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (!uploadError) {
    // Save document record
    await adminClient.from("documents").insert({
      user_id: user.id,
      name: "House Commitment Agreement (Signed)",
      document_type: "house_commitment",
      storage_path: fileName,
      file_size: pdfBuffer.length,
    });

    // Update commitment with PDF path
    await adminClient
      .from("house_commitments")
      .update({ pdf_storage_path: fileName })
      .eq("id", commitmentId);
  }

  await logActivity({
    actorId: user.id,
    eventType: "commitment_signed",
    entityType: "house_commitment",
    entityId: commitmentId,
    description: `${user.full_name} signed the house commitment agreement`,
  });

  // Open the startup (admin fee / deposit) and first rent charges
  // now that the commitment is active. Errors here don't fail the
  // sign action — the lazy sweep on the payments page will catch
  // anything missed.
  try {
    await openAllChargesForCommitment(commitmentId);
  } catch (e) {
    console.error("Failed to open initial charges for commitment", commitmentId, e);
  }

  revalidatePath("/dashboard");
  revalidatePath("/sign-commitment");
  revalidatePath("/payments");
  return {};
}
