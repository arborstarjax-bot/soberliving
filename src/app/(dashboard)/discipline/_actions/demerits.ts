"use server";
import { err, ok, okVoid, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createDemeritSchema, editDemeritSchema } from "@/lib/validations";
import { getHouseYesterday, isoDateInTz, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { sendNotification, notifyHouseStaff } from "@/lib/notifications";


export async function createDemerit(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return err("Not authorized");
  const parsed = createDemeritSchema.safeParse({
    resident_id: formData.get("resident_id"),
    house_id: formData.get("house_id"),
    points: formData.get("points"),
    reason: formData.get("reason"),
    category: formData.get("category") || undefined,
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

  if (error) return err(error.message);

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
  return okVoid();
}

export async function editDemerit(
  demeritId: string,
  reason?: string,
  notes?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return err("Not authorized");

  if (!demeritId) return err("Demerit ID is required");

  const parsed = editDemeritSchema.safeParse({ reason, notes });
  if (!parsed.success) return err(parsed.error.issues[0].message);

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id")
    .eq("id", demeritId)
    .maybeSingle();

  if (!demerit) return err("Demerit not found");
  if (!canAccessHouse(user, demerit.house_id)) {
    return err("Not authorized");
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

  if (error) return err(error.message);

  revalidatePath("/discipline");
  return okVoid();
}

export async function deleteDemerit(demeritId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return err("Not authorized");

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id, resident_id")
    .eq("id", demeritId)
    .single();

  if (!demerit) return err("Demerit not found");
  if (!canAccessHouse(user, demerit.house_id)) {
    return err("Not authorized");
  }

  const { error } = await supabase
    .from("demerits")
    .delete()
    .eq("id", demeritId);

  if (error) return err(error.message);

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
  return okVoid();
}

export async function markDemeritWorkedOff(
  demeritId: string,
  resolutionNote?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return err("Not authorized");

  if (!demeritId) return err("Demerit ID is required");

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id, resident_id")
    .eq("id", demeritId)
    .single();

  if (!demerit) return err("Demerit not found");
  if (!canAccessHouse(user, demerit.house_id)) {
    return err("Not authorized");
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

  if (error) return err(error.message);

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
  return okVoid();
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
  if (user.role === "resident") return err("Not authorized");
  if (houseId && !canAccessHouse(user, houseId)) {
    return err("Not authorized");
  }

  const supabase = await createClient();

  if (!houseId) {
    const { data: allHouses } = await supabase
      .from("houses")
      .select("id")
      .eq("is_active", true);
    let totalCount = 0;
    for (const house of allHouses ?? []) {
      if (!canAccessHouse(user, house.id)) continue;
      const result = await generateMissedChoreDemerits(house.id);
      if ("count" in result) totalCount += (result.count ?? 0);
    }
    revalidatePath("/discipline");
    revalidatePath("/chores");
    return ok({ count: totalCount });
  }

  const { data: houseRow } = await supabase
    .from("houses")
    .select("timezone, workspace_id")
    .eq("id", houseId)
    .single();
  const houseTz = houseRow?.timezone ?? DEFAULT_TIMEZONE;
  const yesterdayStr = getHouseYesterday(houseTz);

  // Workspace setting: when on, a signoff flipped to `missed` also gets
  // an automatic 1-point demerit (staff can still reverse it by changing
  // the signoff status back — the linked demerit is removed).
  let autoDemerit = false;
  if (houseRow?.workspace_id) {
    const { data: wsSettings } = await supabase
      .from("workspace_settings")
      .select("auto_demerit_missed_chores")
      .eq("workspace_id", houseRow.workspace_id)
      .maybeSingle();
    autoDemerit = wsSettings?.auto_demerit_missed_chores ?? false;
  }

  // Residents out on approved leave have their chores covered — the
  // demerit for a missed covered chore lands on the covering resident.
  const { data: approvedCovers } = await supabase
    .from("leave_requests")
    .select("resident_id, covering_resident_id, departure_date, expected_return_date")
    .eq("status", "approved")
    .not("covering_resident_id", "is", null);
  const covererFor = (residentId: string, date: string) =>
    (approvedCovers ?? []).find(
      (c) =>
        c.resident_id === residentId &&
        c.departure_date <= date &&
        date <= c.expected_return_date
    )?.covering_resident_id ?? null;

  // Pending signoffs whose date has already passed. created_at lets us
  // skip back-fills (signoffs inserted mid-cycle, after the sign_off_date
  // had already passed) that would otherwise get flagged as missed.
  const { data: missedSignoffs } = await supabase
    .from("chore_signoffs")
    .select(
      "id, sign_off_date, day_of_week, created_at, rotation_assignment:chore_rotation_assignments(resident_id, chore:chores(house_id, name, days_of_week))"
    )
    .eq("status", "pending")
    .lte("sign_off_date", yesterdayStr);

  if (!missedSignoffs || missedSignoffs.length === 0) {
    return ok({ count: 0 });
  }

  let count = 0;
  const missedSignoffRows = missedSignoffs as unknown as Array<{
    id: string;
    sign_off_date: string;
    day_of_week: string;
    created_at: string | null;
    rotation_assignment: {
      resident_id: string;
      chore: { house_id: string; name: string; days_of_week: string[] | null } | null;
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

    if (!flagError && updated && updated.length > 0) {
      count++;

      if (autoDemerit && ra.chore) {
        // Dedupe via the unique signoff_id — a second flip can't double-issue.
        const { data: existingDemerit } = await supabase
          .from("demerits")
          .select("id")
          .eq("signoff_id", signoff.id)
          .maybeSingle();

        if (!existingDemerit) {
          const covererId = covererFor(ra.resident_id, signoff.sign_off_date);
          const demeritResidentId = covererId ?? ra.resident_id;
          const { data: leaveTaker } = covererId
            ? await supabase
                .from("residents")
                .select("full_name")
                .eq("id", ra.resident_id)
                .single()
            : { data: null };
          const reason = covererId
            ? `Missed chore (covering for ${leaveTaker?.full_name ?? "resident"}): ${ra.chore.name} on ${signoff.sign_off_date}`
            : `Missed chore: ${ra.chore.name} on ${signoff.sign_off_date}`;
          const { data: demerit } = await supabase
            .from("demerits")
            .insert({
              resident_id: demeritResidentId,
              house_id: ra.chore.house_id,
              points: 1,
              reason,
              category: "Missed Chore",
              signoff_id: signoff.id,
              issued_by: user.id,
            })
            .select("id")
            .single();

          if (demerit) {
            const { data: resident } = await supabase
              .from("residents")
              .select("full_name, user_id")
              .eq("id", demeritResidentId)
              .single();

            await logActivity({
              houseId: ra.chore.house_id,
              residentId: demeritResidentId,
              actorId: user.id,
              eventType: "demerit_issued",
              entityType: "demerit",
              entityId: demerit.id,
              description: `Auto-issued 1-point demerit to ${resident?.full_name}: ${reason}`,
              metadata: { points: 1, reason, signoff_id: signoff.id },
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
          }
        }
      }
    }
  }

  revalidatePath("/discipline");
  revalidatePath("/chores");
  return ok({ count });
}

/**
 * One-shot cleanup for demerits auto-issued by the previous (broken)
 * auto-enforce job. Finds demerits whose linked signoff was created
 * AFTER its sign_off_date (i.e. back-filled from a mid-cycle reassign /
 * rotate) and deletes them. Returns the number of demerits removed.
 */

// --- Restrictions ---

export async function uploadDemeritPhoto(formData: FormData): Promise<ActionResult<{ url?: string }>> {
  const user = await requireAuth();
  const supabase = await createClient();

  const file = formData.get("file") as File;
  if (!file) return err("No file provided");

  const ext = file.name.split(".").pop();
  const path = `demerits/${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("chore-photos")
    .upload(path, file, { upsert: false });

  if (error) return err(error.message);

  const { data: publicUrl } = supabase.storage
    .from("chore-photos")
    .getPublicUrl(path);

  return ok({ url: publicUrl.publicUrl });
}

