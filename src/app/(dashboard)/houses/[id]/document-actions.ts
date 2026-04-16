"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const BUCKET = "house-documents";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function uploadHouseDocument(formData: FormData) {
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }

  const houseId = formData.get("houseId");
  const name = formData.get("name");
  const description = formData.get("description");
  const file = formData.get("file");

  if (typeof houseId !== "string" || !houseId) {
    return { error: "Missing house" };
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Name is required" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "File is required" };
  }
  if (file.size > MAX_BYTES) {
    return { error: `File must be ≤ ${MAX_BYTES / (1024 * 1024)} MB` };
  }
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();
  const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${houseId}/${Date.now()}-${safeBase}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) return { error: uploadError.message };

  const { error: insertError } = await supabase
    .from("house_documents")
    .insert({
      house_id: houseId,
      name: name.trim(),
      description:
        typeof description === "string" && description.trim().length > 0
          ? description.trim()
          : null,
      file_path: objectPath,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: user.id,
    });

  if (insertError) {
    // Roll back the file we just uploaded so we don't orphan blobs.
    await supabase.storage.from(BUCKET).remove([objectPath]);
    return { error: insertError.message };
  }

  await logActivity({
    houseId,
    actorId: user.id,
    eventType: "document_uploaded",
    entityType: "house_document",
    entityId: objectPath,
    description: `${user.full_name} uploaded document "${name}"`,
  });

  revalidatePath(`/houses/${houseId}`);
  return {};
}

export async function getHouseDocumentUrl(documentId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("house_documents")
    .select("id, house_id, file_path")
    .eq("id", documentId)
    .single();

  if (!doc) return { error: "Document not found" };
  if (user.role !== "admin" && !canAccessHouse(user, doc.house_id)) {
    return { error: "Not authorized" };
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 60 * 10); // 10 minutes
  if (error || !data) return { error: error?.message ?? "Failed to sign URL" };

  return { url: data.signedUrl };
}

export async function deleteHouseDocument(documentId: string) {
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("house_documents")
    .select("id, house_id, file_path, name")
    .eq("id", documentId)
    .single();

  if (!doc) return { error: "Document not found" };
  if (user.role !== "admin" && !canAccessHouse(user, doc.house_id)) {
    return { error: "Not authorized" };
  }

  // Delete the DB row first so a failed DB delete doesn't leave a dangling
  // row pointing at a missing storage object. A failed storage delete after
  // the row is gone just leaves an orphan blob, which is recoverable.
  const { error } = await supabase
    .from("house_documents")
    .delete()
    .eq("id", documentId);
  if (error) return { error: error.message };

  await supabase.storage.from(BUCKET).remove([doc.file_path]);

  await logActivity({
    houseId: doc.house_id,
    actorId: user.id,
    eventType: "document_deleted",
    entityType: "house_document",
    entityId: documentId,
    description: `${user.full_name} deleted document "${doc.name}"`,
  });

  revalidatePath(`/houses/${doc.house_id}`);
  return {};
}
