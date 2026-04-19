"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { isBlockerApplicableToUser, maybeAutoArchiveBlocker } from "@/lib/blockers";

/**
 * Resident-side ack of a blocker. Writes the signature + an optional
 * "I acknowledge" PDF to the documents table if the author opted to
 * save a copy to the resident's Documents. The layout gate in
 * (dashboard) re-runs on the next navigation and clears the
 * full-screen block if no other pending blockers remain.
 */
export async function acknowledgeBlocker(
  blockerId: string,
  signatureDataUrl: string,
  pdfBase64: string | null
) {
  const user = await requireAuth();
  if (user.role !== "resident") {
    return { error: "Only residents can acknowledge blockers" };
  }
  if (!signatureDataUrl || !signatureDataUrl.startsWith("data:image/")) {
    return { error: "Signature required" };
  }

  const admin = createAdminClient();

  // Load the blocker row for the downstream PDF + log + save-to-docs
  // flow. `isBlockerApplicableToUser` below also reads the row but
  // we need the title / save_to_docs fields here anyway.
  const { data: blocker } = await admin
    .from("blockers")
    .select(
      "id, title, body, save_to_docs, archived_at, target_type, target_house_ids, target_user_ids"
    )
    .eq("id", blockerId)
    .maybeSingle();
  if (!blocker) return { error: "Blocker not found" };
  if (blocker.archived_at) return { error: "Blocker is no longer active" };

  // Re-check targeting server-side. A `"use server"` action can be
  // invoked directly via HTTP POST — bypassing the page-level gate —
  // so we must verify that THIS blockerId is targeted at THIS user,
  // not just that the user has some pending blocker somewhere.
  const applicable = await isBlockerApplicableToUser(
    blockerId,
    user.id,
    admin
  );
  if (!applicable) {
    return { error: "Blocker is not applicable to this user" };
  }

  // Upsert the ack row. PK is (blocker_id, user_id) so a retry from
  // a flaky network is idempotent and doesn't create duplicates.
  const { error: ackError } = await admin
    .from("blocker_acknowledgments")
    .upsert(
      {
        blocker_id: blockerId,
        user_id: user.id,
        acknowledged_at: new Date().toISOString(),
        signature: signatureDataUrl,
      },
      { onConflict: "blocker_id,user_id" }
    );
  if (ackError) return { error: ackError.message };

  // Optional: save the signed ack as a PDF to this user's Documents.
  // Mirrors the /sign-commitment pattern so residents have a durable
  // record of everything they've signed. Failures here don't roll
  // back the ack — the ack is the source of truth.
  if (blocker.save_to_docs && pdfBase64) {
    try {
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const fileName = `${user.id}/blocker-${blockerId}-${Date.now()}.pdf`;
      const { error: uploadError } = await admin.storage
        .from("documents")
        .upload(fileName, pdfBuffer, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (!uploadError) {
        const { data: docRow } = await admin
          .from("documents")
          .insert({
            user_id: user.id,
            name: `Acknowledged: ${blocker.title}`,
            document_type: "blocker_acknowledgment",
            storage_path: fileName,
            file_size: pdfBuffer.length,
          })
          .select("id")
          .maybeSingle();
        if (docRow?.id) {
          await admin
            .from("blocker_acknowledgments")
            .update({ document_id: docRow.id })
            .eq("blocker_id", blockerId)
            .eq("user_id", user.id);
        }
      }
    } catch (err) {
      console.error("Failed to save blocker ack PDF to documents", err);
    }
  }

  await logActivity({
    actorId: user.id,
    eventType: "blocker_acknowledged",
    entityType: "blocker",
    entityId: blockerId,
    description: `${user.full_name} acknowledged blocker "${blocker.title}"`,
  });

  // Auto-archive the notice once every targeted resident has acked.
  // Keeps the staff Notices list scoped to work-in-progress — a
  // fulfilled notice silently moves to the Archived section.
  await maybeAutoArchiveBlocker(blockerId, admin);

  // Bust the layout cache so the gate re-evaluates on the next
  // navigation. Without this the router cache keeps the resident
  // pinned to /acknowledge/[id] even after the ack has landed.
  revalidatePath("/", "layout");

  return {};
}

async function hasExistingAck(
  admin: ReturnType<typeof createAdminClient>,
  blockerId: string,
  userId: string
): Promise<boolean> {
  const { data } = await admin
    .from("blocker_acknowledgments")
    .select("blocker_id")
    .eq("blocker_id", blockerId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * Resident-side helper to grab a short-lived signed URL for a
 * blocker's attachment. Verifies the attachment actually belongs to
 * the blocker (no arbitrary-path access via guessing).
 */
export async function getBlockerAttachmentUrl(
  blockerId: string,
  storagePath: string
) {
  const user = await requireAuth();
  const admin = createAdminClient();

  const { data: blocker } = await admin
    .from("blockers")
    .select("attachment_paths, archived_at, target_type, target_house_ids, target_user_ids")
    .eq("id", blockerId)
    .maybeSingle();
  if (!blocker) return { error: "Blocker not found" };

  const paths = (blocker.attachment_paths as string[] | null) ?? [];
  if (!paths.includes(storagePath)) {
    return { error: "Attachment not found" };
  }

  // Residents who are NOT the target of this blocker shouldn't be
  // fetching its files. Staff bypass this check — they manage blockers.
  if (user.role === "resident") {
    const targetType = blocker.target_type as string;
    if (targetType === "residents") {
      const arr = (blocker.target_user_ids as string[] | null) ?? [];
      if (!arr.includes(user.id)) return { error: "Not authorized" };
    } else if (targetType === "house") {
      const { data: residentRow } = await admin
        .from("residents")
        .select("house_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      const houseId = (residentRow?.house_id as string | null) ?? null;
      const arr = (blocker.target_house_ids as string[] | null) ?? [];
      if (!houseId || !arr.includes(houseId)) {
        return { error: "Not authorized" };
      }
    }
  }

  const { data, error } = await admin.storage
    .from("blocker-attachments")
    .createSignedUrl(storagePath, 60 * 10);
  if (error || !data) return { error: error?.message ?? "Failed to sign URL" };
  return { url: data.signedUrl };
}
