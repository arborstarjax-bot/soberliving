"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createDemeritSchema, editDemeritSchema } from "@/lib/validations";
import { getHouseToday, getHouseYesterday, isoDateInTz, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { sendNotification, notifyHouseStaff } from "@/lib/notifications";

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

  await notifyHouseStaff(
    parsed.data.house_id,
    {
      type: "demerit_issued",
      title: "Demerit Issued",
      message: `${parsed.data.points}-point demerit issued to ${resident?.full_name ?? "resident"}: ${parsed.data.reason}`,
      actionUrl: "/discipline",
      entityType: "demerit",
      entityId: data.id,
    },
    { excludeUserId: user.id }
  );

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

  const parsed = editDemeritSchema.safeParse({ reason, notes });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id")
    .eq("id", demeritId)
    .maybeSingle();

  if (!demerit) return { error: "Demerit not found" };
  if (user.role !== "admin" && !canAccessHouse(user, demerit.house_id)) {
    return { error: "Not authorized" };
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.reason !== undefined) updates.reason = parsed.data.reason;
  if (parsed.data.notes !== undefined)
    updates.notes = parsed.data.notes || null;
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

/**
 * Flag past-due pending signoffs as `missed` so they show up in the
 * Missed Chores action list on the Chores page. Staff then decides
 * per-row whether to issue a Warning or a Demerit (see
 * warning-actions.ts). No auto-demerits — the old behavior penalized
 * residents before staff had a chance to review context.
 *
 * Kept under the original `generateMissedChoreDemerits` export name
 * so existing callers (chores page auto-run, discipline UI button)
 * don't break; the return shape is unchanged.
 */
export async function generateMissedChoreDemerits(houseId?: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };
  if (houseId && user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  if (!houseId) {
    const { data: allHouses } = await supabase
      .from("houses")
      .select("id")
      .eq("is_active", true);
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

  const { data: houseRow } = await supabase
    .from("houses")
    .select("timezone")
    .eq("id", houseId)
    .single();
  const houseTz = houseRow?.timezone ?? DEFAULT_TIMEZONE;
  const yesterdayStr = getHouseYesterday(houseTz);

  // Pending signoffs whose date has already passed. created_at lets us
  // skip back-fills (signoffs inserted mid-cycle, after the sign_off_date
  // had already passed) that would otherwise get flagged as missed.
  const { data: missedSignoffs } = await supabase
    .from("chore_signoffs")
    .select(
      "id, sign_off_date, day_of_week, created_at, rotation_assignment:chore_rotation_assignments(chore:chores(house_id, days_of_week))"
    )
    .eq("status", "pending")
    .lte("sign_off_date", yesterdayStr);

  if (!missedSignoffs || missedSignoffs.length === 0) {
    return { count: 0 };
  }

  let count = 0;
  const missedSignoffRows = missedSignoffs as unknown as Array<{
    id: string;
    sign_off_date: string;
    day_of_week: string;
    created_at: string | null;
    rotation_assignment: {
      chore: { house_id: string; days_of_week: string[] | null } | null;
    } | null;
  }>;
  for (const signoff of missedSignoffRows) {
    const ra = signoff.rotation_assignment;
    if (!ra?.chore) continue;
    if (ra.chore.house_id !== houseId) continue;

    // Defense-in-depth: skip signoffs whose `day_of_week` is no
    // longer part of the chore's current schedule. These are orphan
    // rows from a pre-regeneration schedule edit — flipping them to
    // `missed` would auto-issue a demerit for a day the resident was
    // never supposed to do the chore.
    const choreDays = ra.chore.days_of_week;
    if (
      choreDays &&
      choreDays.length > 0 &&
      !choreDays.includes(signoff.day_of_week)
    ) {
      continue;
    }

    const createdDate = signoff.created_at
      ? isoDateInTz(signoff.created_at as string, houseTz)
      : null;
    if (createdDate && createdDate > (signoff.sign_off_date as string)) {
      continue;
    }

    // Guard against a TOCTOU race: the resident may complete the
    // chore between the SELECT above and this UPDATE. Re-checking
    // status='pending' here means a completion that slipped in
    // concurrently isn't clobbered back to 'missed'. Select the row
    // back so we only increment `count` when a row was actually
    // flipped — otherwise a concurrent completion would silently
    // inflate the "N flagged" number shown to staff.
    const { data: updated, error: flagError } = await supabase
      .from("chore_signoffs")
      .update({ status: "missed", updated_at: new Date().toISOString() })
      .eq("id", signoff.id)
      .eq("status", "pending")
      .select("id");

    if (!flagError && updated && updated.length > 0) count++;
  }

  revalidatePath("/discipline");
  revalidatePath("/chores");
  return { count };
}

/**
 * One-shot cleanup for demerits auto-issued by the previous (broken)
 * auto-enforce job. Finds demerits whose linked signoff was created
 * AFTER its sign_off_date (i.e. back-filled from a mid-cycle reassign /
 * rotate) and deletes them. Returns the number of demerits removed.
 */
export async function cleanupBackfilledAutoDemerits() {
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // Pull candidates: demerits linked to a signoff (auto-issued path).
  const { data: candidates } = await supabase
    .from("demerits")
    .select("id, house_id, resident_id, signoff_id, signoff:chore_signoffs!signoff_id(id, sign_off_date, created_at)")
    .not("signoff_id", "is", null);

  if (!candidates || candidates.length === 0) return { count: 0 };

  // Load each house's tz lazily — most setups have few houses.
  const tzCache = new Map<string, string>();
  async function tzFor(hid: string): Promise<string> {
    if (tzCache.has(hid)) return tzCache.get(hid) as string;
    const { data } = await supabase.from("houses").select("timezone").eq("id", hid).single();
    const tz = data?.timezone ?? DEFAULT_TIMEZONE;
    tzCache.set(hid, tz);
    return tz;
  }

  let count = 0;
  const candidateRows = candidates as unknown as Array<{
    id: string;
    house_id: string;
    resident_id: string;
    signoff_id: string | null;
    signoff: { id: string; sign_off_date: string; created_at: string | null } | null;
  }>;
  for (const d of candidateRows) {
    const houseId = d.house_id;
    if (user.role !== "admin" && !canAccessHouse(user, houseId)) continue;

    const s = d.signoff;
    if (!s?.sign_off_date || !s.created_at) continue;

    const tz = await tzFor(houseId);
    const createdDate = isoDateInTz(s.created_at, tz);
    if (createdDate <= s.sign_off_date) continue; // legit missed chore, leave it

    const demeritId = d.id;
    const { error: delErr } = await supabase.from("demerits").delete().eq("id", demeritId);
    if (delErr) continue;

    count++;
    await logActivity({
      houseId,
      residentId: d.resident_id,
      actorId: user.id,
      eventType: "demerit_deleted",
      entityType: "demerit",
      entityId: demeritId,
      description: `Back-filled auto-demerit removed by ${user.full_name} (signoff was created after its sign_off_date)`,
    });
  }

  revalidatePath("/discipline");
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
      start_date: startDate || getHouseToday(),
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
  revalidatePath("/dashboard");
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
  revalidatePath("/dashboard");
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
  revalidatePath("/dashboard");
  return {};
}

// Edit an existing restriction's type / description / dates / notes.
// Admin / manager only. Logs an "restriction_updated" activity entry
// so the audit trail captures every field change.
export async function updateRestriction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const restrictionId = formData.get("restriction_id") as string;
  const restrictionType = formData.get("restriction_type") as string;
  const description = formData.get("description") as string;
  const notes = formData.get("notes") as string | null;
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string | null;

  if (!restrictionId || !description || !restrictionType) {
    return { error: "Restriction id, type, and description are required" };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("restrictions")
    .select("house_id, resident_id, description, restriction_type")
    .eq("id", restrictionId)
    .single();

  if (!existing) return { error: "Restriction not found" };
  if (user.role !== "admin" && !canAccessHouse(user, existing.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("restrictions")
    .update({
      restriction_type: restrictionType,
      description,
      notes: notes || null,
      start_date: startDate || getHouseToday(),
      end_date: endDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", restrictionId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: existing.house_id,
    residentId: existing.resident_id,
    actorId: user.id,
    eventType: "restriction_updated",
    entityType: "restriction",
    entityId: restrictionId,
    description: `Restriction updated by ${user.full_name}: ${description}`,
    metadata: {
      previous_type: existing.restriction_type,
      new_type: restrictionType,
    },
  });

  revalidatePath("/discipline");
  revalidatePath(`/residents/${existing.resident_id}`);
  revalidatePath("/dashboard");
  return {};
}

export async function expireRestrictions() {
  const user = await requireAuth();
  if (user.role === "resident") return { count: 0 };
  const supabase = await createClient();
  const today = getHouseToday();

  const { data: expired } = await supabase
    .from("restrictions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("is_active", true)
    .lte("end_date", today)
    .not("end_date", "is", null)
    .select("id, resident_id, house_id, description");

  revalidatePath("/discipline");
  revalidatePath("/dashboard");
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
