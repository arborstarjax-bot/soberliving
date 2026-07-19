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

  // Verify this commitment belongs to the user. Also pulls the
  // amendment fields so we can branch on "is this a first-time sign
  // or an amendment?" below.
  const { data: commitment } = await adminClient
    .from("house_commitments")
    .select(
      "id, user_id, status, parent_commitment_id, effective_date, resident_id"
    )
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

  // Defense-in-depth: supersede any OTHER pending commitments for
  // this user. Normally there's only ever one, but manual data edits
  // or failed retries can leave stale rows around — and any surviving
  // pending row keeps `has_pending_commitment=true` in requireAuth,
  // which bounces the resident between /dashboard and /sign-commitment
  // on every request (hit the 20-redirect browser cap).
  const { error: cleanupError } = await adminClient
    .from("house_commitments")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "pending_resident_signature")
    .neq("id", commitmentId);
  if (cleanupError) {
    console.error(
      "Failed to supersede stale pending commitments for user",
      user.id,
      cleanupError.message
    );
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

  const isAmendment = Boolean(commitment.parent_commitment_id);

  // Amendment-specific cleanup: supersede the parent commitment so
  // future sweeps only open charges against the new row, and drop any
  // still-open (unpaid, zero paid_amount) rent charges on the parent
  // dated on or after the amendment's effective date. This keeps the
  // schedule clean — old-rate charges don't linger alongside
  // new-rate ones. Already-paid charges are preserved.
  if (isAmendment && commitment.parent_commitment_id) {
    const parentId = commitment.parent_commitment_id as string;
    const effective = (commitment.effective_date as string | null) ?? null;

    await adminClient
      .from("house_commitments")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("id", parentId);

    if (effective && commitment.resident_id) {
      await adminClient
        .from("payment_charges")
        .delete()
        .eq("commitment_id", parentId)
        .eq("resident_id", commitment.resident_id as string)
        .gte("due_date", effective)
        .eq("status", "open")
        .eq("paid_amount", 0);
    }
  }

  await logActivity({
    actorId: user.id,
    eventType: isAmendment
      ? "commitment_amendment_signed"
      : "commitment_signed",
    entityType: "house_commitment",
    entityId: commitmentId,
    description: isAmendment
      ? `${user.full_name} signed a payment-terms amendment`
      : `${user.full_name} signed the house commitment agreement`,
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
