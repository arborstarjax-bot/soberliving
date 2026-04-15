"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function saveIntakeProgress(formData: Record<string, unknown>, signatures: Record<string, string>) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("intake_forms")
    .upsert(
      {
        user_id: user.id,
        status: "draft",
        form_data: formData,
        signatures,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) return { error: error.message };
  return {};
}

export async function submitIntakeForm(
  formData: Record<string, unknown>,
  signatures: Record<string, string>,
  pdfBase64: string
) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  // Save the completed form
  const { error: formError } = await adminClient
    .from("intake_forms")
    .upsert(
      {
        user_id: user.id,
        status: "completed",
        form_data: formData,
        signatures,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (formError) return { error: formError.message };

  // Upload PDF to Supabase Storage
  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  const fileName = `${user.id}/intake-packet-${Date.now()}.pdf`;

  const { error: uploadError } = await adminClient.storage
    .from("documents")
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    console.error("PDF upload failed:", uploadError.message);
    // Still mark as completed even if upload fails
  }

  // Create document record
  if (!uploadError) {
    await adminClient.from("documents").insert({
      user_id: user.id,
      name: "Jax Sober Living Intake Packet",
      document_type: "intake_packet",
      storage_path: fileName,
      file_size: pdfBuffer.length,
    });
  }

  // Mark intake as completed and auto-populate user profile from intake data
  const fullName = [formData.first_name, formData.last_name].filter(Boolean).join(" ") || user.full_name;
  const phone = (formData.phone as string) || null;

  await adminClient
    .from("users")
    .update({
      intake_completed: true,
      is_resident: true,
      full_name: fullName,
      phone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  await logActivity({
    actorId: user.id,
    eventType: "intake_completed",
    entityType: "user",
    entityId: user.id,
    description: `${fullName} completed the intake packet`,
  });

  revalidatePath("/dashboard");
  revalidatePath("/intake-review");
  return {};
}

export async function getDocumentUrl(storagePath: string) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  // Verify the document belongs to this user or user is staff
  const { data: doc } = await adminClient
    .from("documents")
    .select("user_id")
    .eq("storage_path", storagePath)
    .single();

  if (!doc) return { error: "Document not found" };

  if (doc.user_id !== user.id && user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }

  const { data } = await adminClient.storage
    .from("documents")
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (!data?.signedUrl) return { error: "Failed to generate URL" };

  return { url: data.signedUrl };
}
