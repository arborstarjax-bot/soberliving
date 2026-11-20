"use server";

import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";

const BUCKET = "documents";
const MAX_SIZE = 10 * 1024 * 1024;

export async function uploadVaultDocument(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Not authorized" };

  const file = formData.get("file") as File | null;
  const name = String(formData.get("doc_name") ?? "").trim() || file?.name;
  if (!file || file.size === 0) return { error: "No file selected" };
  if (file.size > MAX_SIZE) return { error: "File too large (max 10MB)" };
  if (!name) return { error: "Name is required" };

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/vault/${Date.now()}-${safeName}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false });
  if (upErr) return { error: upErr.message };

  const { error: insErr } = await admin.from("documents").insert({
    user_id: user.id,
    workspace_id: user.workspace_id,
    name,
    document_type: "vault",
    storage_path: path,
    file_size: file.size,
  });
  if (insErr) return { error: insErr.message };

  await logActivity({
    actorId: user.id,
    eventType: "vault_document_uploaded",
    entityType: "document",
    entityId: name,
    description: `${user.full_name} uploaded vault document "${name}"`,
  });

  revalidatePath("/admin/documents");
  return { success: true };
}

export async function deleteVaultDocument(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Not authorized" };

  const id = String(formData.get("document_id") ?? "");
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id, storage_path, workspace_id")
    .eq("id", id)
    .eq("document_type", "vault")
    .maybeSingle();
  if (!doc || doc.workspace_id !== user.workspace_id) {
    return { error: "Document not found" };
  }

  await admin.storage.from(BUCKET).remove([doc.storage_path]);
  await admin.from("documents").delete().eq("id", doc.id);
  revalidatePath("/admin/documents");
  return { success: true };
}

export async function emailVaultDocument(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Not authorized" };

  const id = String(formData.get("document_id") ?? "");
  const to = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return { error: "Enter a valid email address" };
  }

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id, name, storage_path, workspace_id")
    .eq("id", id)
    .eq("document_type", "vault")
    .maybeSingle();
  if (!doc || doc.workspace_id !== user.workspace_id) {
    return { error: "Document not found" };
  }

  const { data: fileData, error: dlErr } = await admin.storage
    .from(BUCKET)
    .download(doc.storage_path);
  if (dlErr || !fileData) return { error: "Could not read file" };

  const { sendEmail } = await import("@/lib/email");
  const buffer = Buffer.from(await fileData.arrayBuffer());
  const result = await sendEmail({
    to,
    subject: `${doc.name} — shared document`,
    text:
      (message || `${user.full_name} shared a document with you.`) +
      `\n\nAttached: ${doc.name}`,
    attachments: [
      {
        filename: doc.name,
        content: buffer,
      },
    ],
  });
  if (result?.error) return { error: result.error };

  await logActivity({
    actorId: user.id,
    eventType: "vault_document_emailed",
    entityType: "document",
    entityId: doc.id,
    description: `${user.full_name} emailed "${doc.name}" to ${to}`,
  });
  return { success: true };
}
