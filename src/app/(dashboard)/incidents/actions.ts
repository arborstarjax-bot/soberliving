"use server";
import { err, ok, okVoid, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createIncidentSchema } from "@/lib/validations";
import { sendNotification, notifyHouseStaff } from "@/lib/notifications";

export async function createIncident(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createIncidentSchema.safeParse({
    resident_id: formData.get("resident_id"),
    house_id: formData.get("house_id"),
    severity: formData.get("severity"),
    category: formData.get("category") || undefined,
    description: formData.get("description"),
    occurred_at: formData.get("occurred_at"),
  });

  if (!parsed.success) return err(parsed.error.issues[0].message);

  if (!canAccessHouse(user, parsed.data.house_id)) {
    return err("Not authorized");
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name")
    .eq("id", parsed.data.resident_id)
    .single();

  const photoUrl = formData.get("photo_url") as string | null;

  const { data, error } = await supabase
    .from("incidents")
    .insert({ ...parsed.data, reported_by: user.id, ...(photoUrl ? { photo_url: photoUrl } : {}) })
    .select("id")
    .single();

  if (error) return err(error.message);

  await logActivity({
    houseId: parsed.data.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "incident_logged",
    entityType: "incident",
    entityId: data.id,
    description: `${parsed.data.severity} incident logged for ${resident?.full_name} by ${user.full_name}`,
    metadata: { severity: parsed.data.severity, category: parsed.data.category },
  });

  // Notify the resident that an incident has been logged against them.
  const { data: residentUser } = await supabase
    .from("residents")
    .select("user_id")
    .eq("id", parsed.data.resident_id)
    .single();

  if (residentUser?.user_id) {
    await sendNotification({
      userId: residentUser.user_id,
      type: "incident_logged",
      title: "Incident Logged",
      message: `A ${parsed.data.severity} incident was logged${parsed.data.category ? ` (${parsed.data.category})` : ""}.`,
      actionUrl: "/incidents",
      entityType: "incident",
      entityId: data.id,
    });
  }

  revalidatePath("/incidents");
  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return okVoid();
}

export async function uploadIncidentPhoto(formData: FormData): Promise<ActionResult<{ url?: string }>> {
  const user = await requireAuth();
  const supabase = await createClient();

  const file = formData.get("file") as File;
  if (!file) return err("No file provided");

  const ext = file.name.split(".").pop();
  const path = `incidents/${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("chore-photos")
    .upload(path, file, { upsert: false });

  if (error) return err(error.message);

  const { data: publicUrl } = supabase.storage
    .from("chore-photos")
    .getPublicUrl(path);

  return ok({ url: publicUrl.publicUrl });
}
