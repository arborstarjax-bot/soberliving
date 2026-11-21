"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getWorkspaceSettings } from "@/lib/workspace";
import { err, okVoid, type ActionResult } from "@/lib/action-result";

const MEETING_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export async function logMeeting(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireAuth();
  if (user.role !== "resident") {
    return err("Only residents log their own meetings");
  }

  const meetingName = String(formData.get("meeting_name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const meetingAt = String(formData.get("meeting_at") ?? "");
  const facilitatorName =
    String(formData.get("facilitator_name") ?? "").trim() || null;
  const signature = String(formData.get("facilitator_signature") ?? "");
  const photo = formData.get("photo");

  if (!meetingName) return err("Meeting name is required");
  if (!location) return err("Meeting location is required");
  if (!meetingAt || Number.isNaN(Date.parse(meetingAt))) {
    return err("Meeting date & time is required");
  }
  if (!signature.startsWith("data:image/")) {
    return err("The facilitator must sign on the signature pad");
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
  if (!resident) return err("No active resident profile found");

  // Optional photo of the sign-in sheet — stored next to the
  // resident's other uploaded documents.
  let photoPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MEETING_PHOTO_MAX_BYTES) {
      return err("Photo must be under 10MB");
    }
    const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    photoPath = `${user.id}/meetings/${Date.now()}-${safeName}`;
    const adminStorage = createAdminClient();
    const { error: uploadError } = await adminStorage.storage
      .from("documents")
      .upload(photoPath, photo, { contentType: photo.type });
    if (uploadError) return err(uploadError.message);
  } else if (photoRequired) {
    return err("A photo of the meeting is required");
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
  if (error) return err(error.message);

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
  return okVoid();
}

export async function deleteMeeting(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireAuth();
  if (user.role !== "admin") return err("Not authorized");

  const meetingId = String(formData.get("meeting_id") ?? "");
  if (!meetingId) return err("Missing meeting");

  const admin = createAdminClient();
  const { error } = await admin
    .from("meetings")
    .delete()
    .eq("id", meetingId);
  if (error) return err(error.message);

  revalidatePath("/meetings");
  return okVoid();
}
