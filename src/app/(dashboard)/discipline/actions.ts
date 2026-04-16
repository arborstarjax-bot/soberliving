"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createDemeritSchema } from "@/lib/validations";
import { getHouseYesterday, isoDateInTz, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { sendNotification, sendNotificationToHouseManagers } from "@/lib/notifications";

export async function createDemerit(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };
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

  // Notify the resident that they received a demerit (manual issuance; the
  // auto-missed-chore path in generateMissedChoreDemerits already sends its
  // own notification).
  const { data: residentUser } = await supabase
    .from("residents")
    .select("user_id")
    .eq("id", parsed.data.resident_id)
    .single();

  if (residentUser?.user_id) {
    await sendNotification({
      userId: residentUser.user_id,
      type: "demerit_issued",
      title: "Demerit Issued",
      message: `You received a ${parsed.data.points}-point demerit: ${parsed.data.reason}`,
      actionUrl: "/discipline",
      entityType: "demerit",
      entityId: data.id,
    });
  }

  revalidatePath("/discipline");
  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return {};
}

export async function editDemerit(
  demeritId: string,
  reason?: string,
  notes?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  if (!demeritId) return { error: "Demerit ID is required" };

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id")
    .eq("id", demeritId)
    .single();

  if (!demerit) return { error: "Demerit not found" };
  if (user.role !== "admin" && !canAccessHouse(user, demerit.house_id)) {
    return { error: "Not authorized" };
  }

  const updates: Record<string, unknown> = {};
  if (reason !== undefined) updates.reason = reason;
  if (notes !== undefined) updates.notes = notes || null;
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("demerits")
    .update(updates)
    .eq("id", demeritId);

  if (error) return { error: error.message };

  revalidatePath("/discipline");
  return {};
}

export async function deleteDemerit(demeritId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id, resident_id")
    .eq("id", demeritId)
    .single();

  if (!demerit) return { error: "Demerit not found" };
  if (user.role !== "admin" && !canAccessHouse(user, demerit.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("demerits")
    .delete()
    .eq("id", demeritId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: demerit.house_id,
    residentId: demerit.resident_id,
    actorId: user.id,
    eventType: "demerit_deleted",
    entityType: "demerit",
    entityId: demeritId,
    description: `Demerit deleted by ${user.full_name}`,
  });

  revalidatePath("/discipline");
  return {};
}

export async function markDemeritWorkedOff(
  demeritId: string,
  resolutionNote?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  if (!demeritId) return { error: "Demerit ID is required" };

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id, resident_id")
    .eq("id", demeritId)
    .single();

  if (!demerit) return { error: "Demerit not found" };
  if (user.role !== "admin" && !canAccessHouse(user, demerit.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("demerits")
    .update({
      status: "worked_off",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      resolution_note: resolutionNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", demeritId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: demerit.house_id,
    residentId: demerit.resident_id,
    actorId: user.id,
    eventType: "demerit_resolved",
    entityType: "demerit",
    entityId: demeritId,
    description: `Demerit marked as worked off by ${user.full_name}`,
  });

  revalidatePath("/discipline");
  return {};
}

export async function generateMissedChoreDemerits(houseId?: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };
  if (houseId && user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // When no houseId is provided, iterate per-house to use each house's timezone
  if (!houseId) {
    let housesQuery = supabase
      .from("houses")
      .select("id")
      .eq("is_active", true);
    const { data: allHouses } = await housesQuery;
    let totalCount = 0;
    for (const house of allHouses ?? []) {
      if (user.role !== "admin" && !canAccessHouse(user, house.id)) continue;
      const result = await generateMissedChoreDemerits(house.id);
      if ("count" in result) totalCount += (result.count ?? 0);
    }
    revalidatePath("/discipline");
    revalidatePath("/chores");
    return { count: totalCount };
  }

  // Single-house path: use the house's timezone
  const { data: houseRow } = await supabase
    .from("houses")
    .select("timezone")
    .eq("id", houseId)
    .single();
  const houseTz = houseRow?.timezone ?? DEFAULT_TIMEZONE;
  const yesterdayStr = getHouseYesterday(houseTz);

  // Find pending signoffs whose date has passed (they are missed).
  // Also pull created_at so we can filter out back-filled rows that were
  // inserted after their sign_off_date — those come from mid-cycle
  // reassigns / rotation reshuffles and must NOT auto-demerit the new
  // assignee for days they weren't on the rotation.
  const { data: missedSignoffs } = await supabase
    .from("chore_signoffs")
    .select(
      "id, sign_off_date, created_at, rotation_assignment:chore_rotation_assignments(resident_id, chore:chores(name, house_id))"
    )
    .eq("status", "pending")
    .lte("sign_off_date", yesterdayStr);

  if (!missedSignoffs || missedSignoffs.length === 0) {
    return { count: 0 };
  }

  let count = 0;
  for (const signoff of missedSignoffs) {
    const ra = signoff.rotation_assignment as unknown as {
      resident_id: string;
      chore: { name: string; house_id: string } | null;
    } | null;

    if (!ra?.chore) continue;
    if (ra.chore.house_id !== houseId) continue;

    // Defensive guard against mid-cycle back-fills: if the signoff row
    // was created after the sign_off_date, the resident wasn't on this
    // chore on that day — skip it instead of issuing a demerit.
    const createdDate = signoff.created_at
      ? isoDateInTz(signoff.created_at as string, houseTz)
      : null;
    if (createdDate && createdDate > (signoff.sign_off_date as string)) {
      continue;
    }

    const effectiveHouseId = ra.chore.house_id;

    // Duplicate prevention: check if a demerit already exists for this signoff
    const { data: existingDemerit } = await supabase
      .from("demerits")
      .select("id")
      .eq("signoff_id", signoff.id)
      .maybeSingle();

    if (existingDemerit) continue; // Already processed

    // Mark signoff as missed
    await supabase
      .from("chore_signoffs")
      .update({ status: "missed", updated_at: new Date().toISOString() })
      .eq("id", signoff.id);

    // Create a demerit with signoff_id FK for linkage
    const { data: demerit } = await supabase
      .from("demerits")
      .insert({
        resident_id: ra.resident_id,
        house_id: effectiveHouseId,
        points: 1,
        reason: `Missed chore: ${ra.chore.name} on ${signoff.sign_off_date}`,
        category: "Missed Chore",
        issued_by: user.id,
        signoff_id: signoff.id,
      })
      .select("id")
      .single();

    if (demerit) {
      count++;
      await logActivity({
        houseId: effectiveHouseId,
        residentId: ra.resident_id,
        actorId: user.id,
        eventType: "demerit_issued",
        entityType: "demerit",
        entityId: demerit.id,
        description: `Auto-demerit: missed chore "${ra.chore.name}" on ${signoff.sign_off_date}`,
      });

      // Notify the resident about the auto-demerit
      const { data: residentUser } = await supabase
        .from("residents")
        .select("user_id")
        .eq("id", ra.resident_id)
        .single();

      if (residentUser?.user_id) {
        await sendNotification({
          userId: residentUser.user_id,
          type: "missed_chore",
          title: "Missed Chore Demerit",
          message: `You received a demerit for missing "${ra.chore.name}" on ${signoff.sign_off_date}.`,
          actionUrl: "/chores",
          entityType: "demerit",
          entityId: demerit.id,
        });
      }
    }
  }

  revalidatePath("/discipline");
  revalidatePath("/chores");
  return { count };
}

// --- Restrictions ---

export async function createRestriction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const residentId = formData.get("resident_id") as string;
  const houseId = formData.get("house_id") as string;
  const restrictionType = formData.get("restriction_type") as string;
  const description = formData.get("description") as string;
  const notes = formData.get("notes") as string | null;
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string | null;
  const isHouseCommitment = formData.get("is_house_commitment") === "on";

  if (!residentId || !houseId || !description) {
    return { error: "Resident, house, and description are required" };
  }

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name")
    .eq("id", residentId)
    .single();

  const { data, error } = await supabase
    .from("restrictions")
    .insert({
      resident_id: residentId,
      house_id: houseId,
      restriction_type: restrictionType || "custom",
      description,
      notes: notes || null,
      start_date: startDate || new Date().toISOString().split("T")[0],
      end_date: endDate || null,
      is_house_commitment: isHouseCommitment,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    residentId,
    actorId: user.id,
    eventType: "restriction_created",
    entityType: "restriction",
    entityId: data.id,
    description: `Restriction added for ${resident?.full_name} by ${user.full_name}: ${description}`,
    metadata: { restriction_type: restrictionType, is_house_commitment: isHouseCommitment },
  });

  const { data: residentUser } = await supabase
    .from("residents")
    .select("user_id")
    .eq("id", residentId)
    .single();

  if (residentUser?.user_id) {
    await sendNotification({
      userId: residentUser.user_id,
      type: "restriction_created",
      title: isHouseCommitment ? "House Commitment Added" : "Restriction Added",
      message: description,
      actionUrl: "/discipline",
      entityType: "restriction",
      entityId: data.id,
    });
  }

  revalidatePath("/discipline");
  revalidatePath(`/residents/${residentId}`);
  return {};
}

export async function liftRestriction(restrictionId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: restriction } = await supabase
    .from("restrictions")
    .select("house_id, resident_id, description")
    .eq("id", restrictionId)
    .single();

  if (!restriction) return { error: "Restriction not found" };
  if (user.role !== "admin" && !canAccessHouse(user, restriction.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("restrictions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", restrictionId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: restriction.house_id,
    residentId: restriction.resident_id,
    actorId: user.id,
    eventType: "restriction_lifted",
    entityType: "restriction",
    entityId: restrictionId,
    description: `Restriction lifted by ${user.full_name}: ${restriction.description}`,
  });

  const { data: residentUser } = await supabase
    .from("residents")
    .select("user_id")
    .eq("id", restriction.resident_id)
    .single();

  if (residentUser?.user_id) {
    await sendNotification({
      userId: residentUser.user_id,
      type: "restriction_lifted",
      title: "Restriction Lifted",
      message: restriction.description,
      actionUrl: "/discipline",
      entityType: "restriction",
      entityId: restrictionId,
    });
  }

  revalidatePath("/discipline");
  revalidatePath(`/residents/${restriction.resident_id}`);
  return {};
}

export async function deleteRestriction(restrictionId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: restriction } = await supabase
    .from("restrictions")
    .select("house_id, resident_id, description")
    .eq("id", restrictionId)
    .single();

  if (!restriction) return { error: "Restriction not found" };
  if (user.role !== "admin" && !canAccessHouse(user, restriction.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("restrictions")
    .delete()
    .eq("id", restrictionId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: restriction.house_id,
    residentId: restriction.resident_id,
    actorId: user.id,
    eventType: "restriction_deleted",
    entityType: "restriction",
    entityId: restrictionId,
    description: `Restriction deleted by ${user.full_name}: ${restriction.description}`,
  });

  revalidatePath("/discipline");
  revalidatePath(`/residents/${restriction.resident_id}`);
  return {};
}

export async function expireRestrictions() {
  const user = await requireAuth();
  if (user.role === "resident") return { count: 0 };
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: expired } = await supabase
    .from("restrictions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("is_active", true)
    .lte("end_date", today)
    .not("end_date", "is", null)
    .select("id, resident_id, house_id, description");

  revalidatePath("/discipline");
  return { count: expired?.length ?? 0 };
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
