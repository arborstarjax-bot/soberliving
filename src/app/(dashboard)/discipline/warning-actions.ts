"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createWarningSchema } from "@/lib/validations";
import { sendNotification, notifyHouseStaff } from "@/lib/notifications";

export async function createWarning(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const parsed = createWarningSchema.safeParse({
    resident_id: formData.get("resident_id"),
    house_id: formData.get("house_id"),
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
    .select("full_name, user_id")
    .eq("id", parsed.data.resident_id)
    .single();

  const notes = (formData.get("notes") as string | null) || null;
  const photoUrl = (formData.get("photo_url") as string | null) || null;

  const { data, error } = await supabase
    .from("warnings")
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
    eventType: "warning_issued",
    entityType: "warning",
    entityId: data.id,
    description: `Warning issued to ${resident?.full_name} by ${user.full_name}: ${parsed.data.reason}`,
    metadata: { reason: parsed.data.reason, category: parsed.data.category ?? null },
  });

  if (resident?.user_id) {
    await sendNotification({
      userId: resident.user_id,
      type: "warning_issued",
      title: "Warning Issued",
      message: `You received a warning: ${parsed.data.reason}. Please correct this going forward.`,
      actionUrl: "/discipline",
      entityType: "warning",
      entityId: data.id,
    });
  }

  await notifyHouseStaff(
    parsed.data.house_id,
    {
      type: "warning_issued",
      title: "Warning Issued",
      message: `Warning issued to ${resident?.full_name ?? "resident"}: ${parsed.data.reason}`,
      actionUrl: "/discipline",
      entityType: "warning",
      entityId: data.id,
    },
    { excludeUserId: user.id }
  );

  revalidatePath("/discipline");
  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return {};
}

export async function editWarning(
  warningId: string,
  reason?: string,
  notes?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };
  if (!warningId) return { error: "Warning ID is required" };

  const supabase = await createClient();

  const { data: warning } = await supabase
    .from("warnings")
    .select("house_id")
    .eq("id", warningId)
    .single();

  if (!warning) return { error: "Warning not found" };
  if (user.role !== "admin" && !canAccessHouse(user, warning.house_id)) {
    return { error: "Not authorized" };
  }

  const updates: Record<string, unknown> = {};
  if (reason !== undefined) updates.reason = reason;
  if (notes !== undefined) updates.notes = notes || null;
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("warnings")
    .update(updates)
    .eq("id", warningId);

  if (error) return { error: error.message };

  revalidatePath("/discipline");
  return {};
}

export async function deleteWarning(warningId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: warning } = await supabase
    .from("warnings")
    .select("house_id, resident_id")
    .eq("id", warningId)
    .single();

  if (!warning) return { error: "Warning not found" };
  if (user.role !== "admin" && !canAccessHouse(user, warning.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("warnings")
    .delete()
    .eq("id", warningId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: warning.house_id,
    residentId: warning.resident_id,
    actorId: user.id,
    eventType: "warning_deleted",
    entityType: "warning",
    entityId: warningId,
    description: `Warning deleted by ${user.full_name}`,
  });

  revalidatePath("/discipline");
  return {};
}

/**
 * Issue a warning tied to a specific missed chore signoff. Used from the
 * Missed Chores action list. Pre-populates category "Missed Chore" and a
 * reason derived from the signoff.
 */
export async function issueChoreWarning(signoffId: string, extraNote?: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: signoff } = await supabase
    .from("chore_signoffs")
    .select(
      "id, sign_off_date, rotation_assignment:chore_rotation_assignments(resident_id, chore:chores(name, house_id))"
    )
    .eq("id", signoffId)
    .single();

  if (!signoff) return { error: "Signoff not found" };

  const ra = signoff.rotation_assignment as unknown as {
    resident_id: string;
    chore: { name: string; house_id: string } | null;
  } | null;

  if (!ra?.chore) return { error: "Chore not found" };
  if (user.role !== "admin" && !canAccessHouse(user, ra.chore.house_id)) {
    return { error: "Not authorized" };
  }

  const reason = `Missed chore: ${ra.chore.name} on ${signoff.sign_off_date}`;

  // Dedupe: if a warning already exists for this signoff, do nothing.
  const { data: existing } = await supabase
    .from("warnings")
    .select("id")
    .eq("signoff_id", signoffId)
    .maybeSingle();
  if (existing) return { error: "A warning has already been issued for this missed chore" };

  const { data: warning, error } = await supabase
    .from("warnings")
    .insert({
      resident_id: ra.resident_id,
      house_id: ra.chore.house_id,
      reason,
      category: "Missed Chore",
      notes: extraNote || null,
      signoff_id: signoffId,
      issued_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name, user_id")
    .eq("id", ra.resident_id)
    .single();

  await logActivity({
    houseId: ra.chore.house_id,
    residentId: ra.resident_id,
    actorId: user.id,
    eventType: "warning_issued",
    entityType: "warning",
    entityId: warning.id,
    description: `Warning issued to ${resident?.full_name} by ${user.full_name}: ${reason}`,
    metadata: { reason, category: "Missed Chore", signoff_id: signoffId },
  });

  if (resident?.user_id) {
    await sendNotification({
      userId: resident.user_id,
      type: "warning_issued",
      title: "Warning Issued",
      message: `Warning: you missed "${ra.chore.name}" on ${signoff.sign_off_date}. Please complete and correct it.`,
      actionUrl: "/chores",
      entityType: "warning",
      entityId: warning.id,
    });
  }

  await notifyHouseStaff(
    ra.chore.house_id,
    {
      type: "warning_issued",
      title: "Warning Issued",
      message: `Warning issued to ${resident?.full_name ?? "resident"} for missing "${ra.chore.name}" on ${signoff.sign_off_date}.`,
      actionUrl: "/discipline",
      entityType: "warning",
      entityId: warning.id,
    },
    { excludeUserId: user.id }
  );

  revalidatePath("/discipline");
  revalidatePath("/chores");
  return {};
}

/**
 * Issue a demerit tied to a specific missed chore signoff. Used from the
 * Missed Chores action list. Mirrors issueChoreWarning but goes into the
 * demerits table with 1 point.
 */
export async function issueChoreDemerit(signoffId: string, extraNote?: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: signoff } = await supabase
    .from("chore_signoffs")
    .select(
      "id, sign_off_date, rotation_assignment:chore_rotation_assignments(resident_id, chore:chores(name, house_id))"
    )
    .eq("id", signoffId)
    .single();

  if (!signoff) return { error: "Signoff not found" };

  const ra = signoff.rotation_assignment as unknown as {
    resident_id: string;
    chore: { name: string; house_id: string } | null;
  } | null;

  if (!ra?.chore) return { error: "Chore not found" };
  if (user.role !== "admin" && !canAccessHouse(user, ra.chore.house_id)) {
    return { error: "Not authorized" };
  }

  // Dedupe: if a demerit already exists for this signoff, do nothing.
  const { data: existing } = await supabase
    .from("demerits")
    .select("id")
    .eq("signoff_id", signoffId)
    .maybeSingle();
  if (existing) return { error: "A demerit has already been issued for this missed chore" };

  const reason = `Missed chore: ${ra.chore.name} on ${signoff.sign_off_date}`;

  const { data: demerit, error } = await supabase
    .from("demerits")
    .insert({
      resident_id: ra.resident_id,
      house_id: ra.chore.house_id,
      points: 1,
      reason,
      category: "Missed Chore",
      notes: extraNote || null,
      signoff_id: signoffId,
      issued_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name, user_id")
    .eq("id", ra.resident_id)
    .single();

  await logActivity({
    houseId: ra.chore.house_id,
    residentId: ra.resident_id,
    actorId: user.id,
    eventType: "demerit_issued",
    entityType: "demerit",
    entityId: demerit.id,
    description: `1-point demerit issued to ${resident?.full_name} by ${user.full_name}: ${reason}`,
    metadata: { points: 1, reason, signoff_id: signoffId },
  });

  if (resident?.user_id) {
    await sendNotification({
      userId: resident.user_id,
      type: "demerit_issued",
      title: "Demerit Issued",
      message: `You received a 1-point demerit: ${reason}`,
      actionUrl: "/discipline",
      entityType: "demerit",
      entityId: demerit.id,
    });
  }

  await notifyHouseStaff(
    ra.chore.house_id,
    {
      type: "demerit_issued",
      title: "Demerit Issued",
      message: `1-point demerit issued to ${resident?.full_name ?? "resident"}: ${reason}`,
      actionUrl: "/discipline",
      entityType: "demerit",
      entityId: demerit.id,
    },
    { excludeUserId: user.id }
  );

  revalidatePath("/discipline");
  revalidatePath("/chores");
  return {};
}

export async function uploadWarningPhoto(formData: FormData): Promise<{ url?: string; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const file = formData.get("file") as File;
  if (!file) return { error: "No file provided" };

  const ext = file.name.split(".").pop();
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("demerit-photos")
    .upload(path, file, { upsert: false });

  if (error) return { error: error.message };

  const { data: publicUrl } = supabase.storage
    .from("demerit-photos")
    .getPublicUrl(path);

  return { url: publicUrl.publicUrl };
}
