"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { notifyHouseStaff } from "@/lib/notifications";

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
  const firstName = ((formData.first_name as string) || "").trim();
  const middleName = ((formData.middle_name as string) || "").trim();
  const lastName = ((formData.last_name as string) || "").trim();
  const intakeName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  // Only use intake name if it's meaningful; otherwise keep existing
  const fullName = intakeName || user.full_name;
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

  // Notify staff that a new intake application is waiting for review.
  // Admins always see it; managers only see it if the applicant has
  // already been tied to one of their houses (e.g. via admin invite).
  // Self-signup applicants have no house yet, so only admins get pinged.
  const { data: userRow } = await adminClient
    .from("users")
    .select("pending_house_id")
    .eq("id", user.id)
    .single();
  const pendingHouseId =
    (userRow as { pending_house_id?: string | null } | null)?.pending_house_id ??
    null;

  await notifyHouseStaff(pendingHouseId, {
    type: "intake_submitted",
    title: "New Intake Application",
    message: `${fullName} submitted their intake packet and is waiting for review.`,
    actionUrl: "/intake-review",
    entityType: "user",
    entityId: user.id,
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
