"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

/**
 * Admin-only hard delete of a resident-linked document.
 *
 * Removes the storage object first (best effort — a failure here is
 * logged but does not block the DB delete, otherwise orphaned DB
 * rows would accumulate if the object was already manually purged)
 * and then deletes the `documents` row.
 *
 * Scoped to admins because documents include signed agreements,
 * intake packets, and receipts that managers should not be able to
 * destroy unilaterally.
 */
export async function deleteDocument(documentId: string) {
  const user = await requireAuth();
  if (user.role !== "admin") {
    return { error: "Only admins can delete documents" };
  }
  if (!documentId || typeof documentId !== "string") {
    return { error: "Invalid document id" };
  }

  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, name, storage_path, user_id, document_type")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) return { error: "Document not found" };

  // Look up the resident that owns this document so the activity
  // log row is attached to the right resident/house. Residents may
  // not exist for every document (some are linked purely by user),
  // in which case we log against the actor's own house scope.
  const { data: resident } = doc.user_id
    ? await supabase
        .from("residents")
        .select("id, full_name, house_id")
        .eq("user_id", doc.user_id)
        .eq("status", "active")
        .maybeSingle()
    : { data: null };

  // Storage object delete via service-role client — the user-scoped
  // client can't unconditionally delete bucket objects.
  if (doc.storage_path) {
    const adminClient = createAdminClient();
    const { error: storageError } = await adminClient.storage
      .from("documents")
      .remove([doc.storage_path]);
    if (storageError) {
      // Don't fail closed: an already-missing object shouldn't block
      // the DB delete. Log and proceed.
      console.error(
        "[deleteDocument] storage remove failed",
        storageError.message
      );
    }
  }

  const { error: dbError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (dbError) return { error: dbError.message };

  const houseId = resident?.house_id ?? null;
  if (houseId) {
    await logActivity({
      houseId,
      residentId: resident?.id,
      actorId: user.id,
      eventType: "document_deleted",
      entityType: "document",
      entityId: documentId,
      description: `Document "${doc.name}" deleted by ${user.full_name}`,
    });
  }

  if (resident?.id) {
    revalidatePath(`/residents/${resident.id}`);
  }
  revalidatePath("/my-documents");
  return {};
}
