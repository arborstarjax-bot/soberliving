"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getWorkspaceSettings } from "@/lib/workspace";

const MEETING_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export async function logMeeting(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireAuth();
  if (user.role !== "resident") {
    return { error: "Only residents log their own meetings" };
  }

  const meetingName = String(formData.get("meeting_name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const meetingAt = String(formData.get("meeting_at") ?? "");
  const facilitatorName =
    String(formData.get("facilitator_name") ?? "").trim() || null;
  const signature = String(formData.get("facilitator_signature") ?? "");
  const photo = formData.get("photo");

  if (!meetingName) return { error: "Meeting name is required" };
  if (!location) return { error: "Meeting location is required" };
  if (!meetingAt || Number.isNaN(Date.parse(meetingAt))) {
    return { error: "Meeting date & time is required" };
  }
  if (!signature.startsWith("data:image/")) {
    return { error: "The facilitator must sign on the signature pad" };
  }

  const wsSettings = user.workspace_id
    ? await getWorkspaceSettings(user.workspace_id)
    : null;
  const photoRequired = wsSettings?.require_meeting_photo === true;

  const supabase = await createClient();
  const { data: resident } = await supabase
    .from("residents")
    .select("id, house_id, full_name")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!resident) return { error: "No active resident profile found" };

  // Optional photo of the sign-in sheet — stored next to the
  // resident's other uploaded documents.
  let photoPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MEETING_PHOTO_MAX_BYTES) {
      return { error: "Photo must be under 10MB" };
    }
    const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    photoPath = `${user.id}/meetings/${Date.now()}-${safeName}`;
    const adminStorage = createAdminClient();
    const { error: uploadError } = await adminStorage.storage
      .from("documents")
      .upload(photoPath, photo, { contentType: photo.type });
    if (uploadError) return { error: uploadError.message };
  } else if (photoRequired) {
    return { error: "A photo of the meeting is required" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("meetings").insert({
    resident_id: resident.id,
    house_id: resident.house_id,
    meeting_name: meetingName,
    location,
    meeting_at: new Date(meetingAt).toISOString(),
    facilitator_name: facilitatorName,
    facilitator_signature: signature,
    photo_path: photoPath,
  });
  if (error) return { error: error.message };

  await logActivity({
    houseId: resident.house_id ?? "",
    residentId: resident.id,
    actorId: user.id,
    eventType: "meeting_logged",
    entityType: "meeting",
    entityId: resident.id,
    description: `${resident.full_name} logged meeting "${meetingName}"`,
  });

  revalidatePath("/meetings");
  return {};
}

export async function deleteMeeting(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Not authorized" };

  const meetingId = String(formData.get("meeting_id") ?? "");
  if (!meetingId) return { error: "Missing meeting" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("meetings")
    .delete()
    .eq("id", meetingId);
  if (error) return { error: error.message };

  revalidatePath("/meetings");
  return {};
}
