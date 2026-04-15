"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createDemeritSchema } from "@/lib/validations";

export async function createDemerit(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createDemeritSchema.safeParse({
    resident_id: formData.get("resident_id"),
    house_id: formData.get("house_id"),
    points: formData.get("points"),
    reason: formData.get("reason"),
    category: formData.get("category") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (user.role !== "admin" && !canAccessHouse(user, parsed.data.house_id)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name")
    .eq("id", parsed.data.resident_id)
    .single();

  const notes = formData.get("notes") as string | null;
  const photoUrl = formData.get("photo_url") as string | null;

  const { data, error } = await supabase
    .from("demerits")
    .insert({
      ...parsed.data,
      issued_by: user.id,
      ...(notes ? { notes } : {}),
      ...(photoUrl ? { photo_url: photoUrl } : {}),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: parsed.data.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "demerit_issued",
    entityType: "demerit",
    entityId: data.id,
    description: `${parsed.data.points}-point demerit issued to ${resident?.full_name} by ${user.full_name}: ${parsed.data.reason}`,
    metadata: { points: parsed.data.points, reason: parsed.data.reason },
  });

  revalidatePath("/discipline");
  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return {};
}

export async function uploadDemeritPhoto(formData: FormData): Promise<{ url?: string; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const file = formData.get("file") as File;
  if (!file) return { error: "No file provided" };

  const ext = file.name.split(".").pop();
  const path = `demerits/${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("chore-photos")
    .upload(path, file, { upsert: false });

  if (error) return { error: error.message };

  const { data: publicUrl } = supabase.storage
    .from("chore-photos")
    .getPublicUrl(path);

  return { url: publicUrl.publicUrl };
}
