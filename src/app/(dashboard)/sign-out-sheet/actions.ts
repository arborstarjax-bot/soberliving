"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { sendNotification, notifyHouseStaff } from "@/lib/notifications";
import { z } from "zod";
import { getEffectiveHouseCurfews } from "@/lib/workspace";

const signOutSchema = z.object({
  resident_id: z.string().uuid(),
  destination: z.string().trim().min(1, "Destination is required").max(300),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

async function loadResidentWithActiveRestrictions(residentId: string) {
  const supabase = await createClient();
  const { data: resident } = await supabase
    .from("residents")
    .select("id, user_id, house_id, full_name, status")
    .eq("id", residentId)
    .single();
  if (!resident) return { resident: null, hasNoLeave: false };

  const { data: restrictions } = await supabase
    .from("restrictions")
    .select("id, restriction_type")
    .eq("resident_id", residentId)
    .eq("is_active", true);

  // Spec: only an active No Leave restriction blocks sign-out. House
  // Commitment is an intake-period restriction on overnight leaves,
  // not on stepping out of the house; No Overnight is a curfew rule.
  // Neither prevents a resident from signing out during the day.
  const hasNoLeave = (restrictions ?? []).some(
    (r) =>
      (r as { restriction_type: string }).restriction_type === "no_leave"
  );

  return { resident, hasNoLeave };
}

/**
 * Sign out a resident. Residents can only sign out themselves. Staff
 * (admin or manager-of-that-house) can sign out a resident on their
 * behalf. A resident with an active No Leave / House Commitment
 * restriction cannot sign out and staff cannot sign them out either.
 */
export async function signOutResident(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = signOutSchema.safeParse({
    resident_id: formData.get("resident_id"),
    destination: formData.get("destination"),
    notes: formData.get("notes") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { resident, hasNoLeave } = await loadResidentWithActiveRestrictions(
    parsed.data.resident_id
  );
  if (!resident) return { error: "Resident not found" };
  if (resident.status !== "active") {
    return { error: "Only active residents can sign out" };
  }
  if (hasNoLeave) {
    return { error: "Resident has an active No Leave restriction" };
  }

  // Authorization
  if (user.role === "resident") {
    if (resident.user_id !== user.id) return { error: "Not authorized" };
  } else if (user.role !== "admin" && !canAccessHouse(user, resident.house_id)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // Guard against concurrent open sign-outs (also enforced by the
  // partial unique index on the table, but a friendly error beats a
  // raw constraint violation).
  const { data: existingOpen } = await supabase
    .from("sign_out_sheet")
    .select("id")
    .eq("resident_id", resident.id)
    .is("time_in", null)
    .maybeSingle();
  if (existingOpen) {
    return { error: "Resident is already signed out" };
  }

  const { data: row, error } = await supabase
    .from("sign_out_sheet")
    .insert({
      resident_id: resident.id,
      house_id: resident.house_id,
      destination: parsed.data.destination,
      signed_out_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: resident.house_id,
    residentId: resident.id,
    actorId: user.id,
    eventType: "resident_signed_out",
    entityType: "sign_out_sheet",
    entityId: row.id,
    description:
      user.id === resident.user_id
        ? `${resident.full_name} signed out to ${parsed.data.destination}`
        : `${user.full_name} signed out ${resident.full_name} to ${parsed.data.destination}`,
    metadata: { destination: parsed.data.destination },
  });

  // Notify house staff so a manager has visibility someone is out.
  // past_curfew=false so push.ts sends only when preference is 'all'.
  await notifyHouseStaff(
    resident.house_id,
    {
      type: "resident_signed_out",
      title: "Resident Signed Out",
      message: `${resident.full_name} signed out to ${parsed.data.destination}`,
      actionUrl: "/sign-out-sheet",
      entityType: "sign_out_sheet",
      entityId: row.id,
      metadata: { past_curfew: false },
    },
    { excludeUserId: user.id }
  );

  revalidatePath("/sign-out-sheet");
  revalidatePath("/dashboard");
  return {};
}

/**
 * Sign a resident back in. Residents sign in their own open row;
 * staff can sign in any open row in their house. Staff may optionally
 * attach a Warning or Demerit in the same action (e.g. late return).
 */
const signInSchema = z.object({
  sign_out_id: z.string().uuid(),
  discipline: z.enum(["none", "warning", "demerit"]).optional(),
  discipline_reason: z.string().trim().max(500).optional().or(z.literal("")),
  demerit_points: z.coerce.number().int().min(1).max(10).optional(),
});

export async function signInResident(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = signInSchema.safeParse({
    sign_out_id: formData.get("sign_out_id"),
    discipline: formData.get("discipline") || "none",
    discipline_reason: formData.get("discipline_reason") || "",
    demerit_points: formData.get("demerit_points") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("sign_out_sheet")
    .select("id, resident_id, house_id, destination, time_out, time_in, resident:residents(full_name, user_id)")
    .eq("id", parsed.data.sign_out_id)
    .maybeSingle();
  if (!row) return { error: "Sign-out record not found" };
  if (row.time_in) return { error: "Resident is already signed in" };

  const resident = row.resident as unknown as { full_name: string; user_id: string | null } | null;

  // Authorization — resident can only sign in their own row; staff
  // scoped to their house.
  const isSelf = !!resident && resident.user_id === user.id;
  if (user.role === "resident") {
    if (!isSelf) return { error: "Not authorized" };
    if (parsed.data.discipline && parsed.data.discipline !== "none") {
      return { error: "Residents cannot issue discipline" };
    }
  } else if (user.role !== "admin" && !canAccessHouse(user, row.house_id)) {
    return { error: "Not authorized" };
  }

  // Validate the discipline form shape BEFORE we mutate the sign-out
  // row. Otherwise a sign-in with "warning" + blank reason would commit
  // the time_in update + activity log, then return an error — the UI
  // shows failure but the resident is silently signed in and the
  // discipline is lost.
  const attachingDiscipline =
    !!parsed.data.discipline &&
    parsed.data.discipline !== "none" &&
    user.role !== "resident";
  const disciplineReason = parsed.data.discipline_reason?.trim() ?? "";
  if (attachingDiscipline && !disciplineReason) {
    return { error: "Reason is required when attaching discipline" };
  }

  // Determine if the sign-in is past curfew or next-day (missed).
  const now = new Date();
  const pastCurfew = await isPastCurfew(row.house_id, row.time_out, now);

  // Conditional update: only close the row if it is still open. This
  // makes the sign-in step idempotent under a double-submit and
  // prevents a concurrent second submission from silently attaching a
  // second Warning/Demerit after the first one already landed.
  const nowIso = now.toISOString();
  const { data: closedRows, error: updateErr } = await supabase
    .from("sign_out_sheet")
    .update({ time_in: nowIso, signed_in_by: user.id, past_curfew: pastCurfew })
    .eq("id", row.id)
    .is("time_in", null)
    .select("id");
  if (updateErr) return { error: updateErr.message };
  if (!closedRows || closedRows.length === 0) {
    return { error: "Resident is already signed in" };
  }

  await logActivity({
    houseId: row.house_id,
    residentId: row.resident_id,
    actorId: user.id,
    eventType: "resident_signed_in",
    entityType: "sign_out_sheet",
    entityId: row.id,
    description: isSelf
      ? `${resident?.full_name ?? "Resident"} signed back in from ${row.destination}${pastCurfew ? " (PAST CURFEW)" : ""}`
      : `${user.full_name} signed in ${resident?.full_name ?? "resident"} from ${row.destination}${pastCurfew ? " (PAST CURFEW)" : ""}`,
    metadata: { destination: row.destination, past_curfew: pastCurfew },
  });

  // Notify house staff of every sign-in. The metadata carries the
  // past_curfew flag so push.ts can honour the staff member's preference
  // ('all' sends for every sign-in, 'curfew_only' only for late returns).
  await notifyHouseStaff(
    row.house_id,
    {
      type: "resident_signed_in",
      title: pastCurfew
        ? "⚠️ Late Sign-In (Past Curfew)"
        : "Resident Signed In",
      message: pastCurfew
        ? `${resident?.full_name ?? "Resident"} signed in past curfew from ${row.destination}`
        : `${resident?.full_name ?? "Resident"} signed back in from ${row.destination}`,
      actionUrl: "/sign-out-sheet",
      entityType: "sign_out_sheet",
      entityId: row.id,
      metadata: { past_curfew: pastCurfew },
    },
    { excludeUserId: user.id }
  );

  // Optional discipline in the same commit. Only staff reach this.
  // Reason was already validated above; `reason` is guaranteed non-empty.
  if (attachingDiscipline) {
    const reason = disciplineReason;

    if (parsed.data.discipline === "warning") {
      const { data: warn, error: warnErr } = await supabase
        .from("warnings")
        .insert({
          resident_id: row.resident_id,
          house_id: row.house_id,
          reason,
          category: "sign_out_return",
          issued_by: user.id,
        })
        .select("id")
        .single();
      if (warnErr) return { error: warnErr.message };

      await logActivity({
        houseId: row.house_id,
        residentId: row.resident_id,
        actorId: user.id,
        eventType: "warning_issued",
        entityType: "warning",
        entityId: warn.id,
        description: `Warning issued to ${resident?.full_name ?? "resident"} by ${user.full_name}: ${reason}`,
        metadata: { reason, category: "sign_out_return", sign_out_id: row.id },
      });
      if (resident?.user_id) {
        await sendNotification({
          userId: resident.user_id,
          type: "warning_issued",
          title: "Warning Issued",
          message: `You received a warning: ${reason}. Please correct this going forward.`,
          actionUrl: "/discipline",
          entityType: "warning",
          entityId: warn.id,
        });
      }
    } else {
      const points = parsed.data.demerit_points ?? 1;
      const { data: dem, error: demErr } = await supabase
        .from("demerits")
        .insert({
          resident_id: row.resident_id,
          house_id: row.house_id,
          points,
          reason,
          category: "sign_out_return",
          issued_by: user.id,
        })
        .select("id")
        .single();
      if (demErr) return { error: demErr.message };

      await logActivity({
        houseId: row.house_id,
        residentId: row.resident_id,
        actorId: user.id,
        eventType: "demerit_issued",
        entityType: "demerit",
        entityId: dem.id,
        description: `${points}-point demerit issued to ${resident?.full_name ?? "resident"} by ${user.full_name}: ${reason}`,
        metadata: { points, reason, category: "sign_out_return", sign_out_id: row.id },
      });
      if (resident?.user_id) {
        await sendNotification({
          userId: resident.user_id,
          type: "demerit_issued",
          title: "Demerit Issued",
          message: `You received a ${points}-point demerit: ${reason}`,
          actionUrl: "/discipline",
          entityType: "demerit",
          entityId: dem.id,
        });
      }
    }
  }

  revalidatePath("/sign-out-sheet");
  revalidatePath("/dashboard");
  revalidatePath("/discipline");
  return {};
}

// --- Curfew helpers ---

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/**
 * Determine if a sign-in is past curfew.
 *
 * Curfew is defined by a window: curfew_start_time → curfew_time.
 * If curfew_start_time is not set, it defaults to curfew_time
 * (anything after that time is past curfew).
 *
 * Rules:
 * 1. Look at the day-of-week of the sign-out time (in Eastern TZ).
 * 2. Get that day's curfew from house_curfews.
 * 3. If no curfew is set for that day, it's not past curfew.
 * 4. If the sign-in is on a different calendar day than the sign-out
 *    (next day or later — "missed sign-in"), it's past curfew.
 * 5. If it's the same calendar day, compare the sign-in time to the
 *    curfew start time. Past curfew if sign-in is at or after it.
 */
async function isPastCurfew(
  houseId: string,
  timeOutIso: string,
  signInDate: Date
): Promise<boolean> {
  const curfews = await getEffectiveHouseCurfews(houseId);
  if (curfews.length === 0) return false;

  const tz = "America/New_York";

  // Get the day-of-week of the sign-out in house TZ
  const outDate = new Date(timeOutIso);
  const outInTz = new Date(outDate.toLocaleString("en-US", { timeZone: tz }));
  const outDayName = DAY_NAMES[outInTz.getDay()];

  const curfew = curfews.find((c) => c.day_of_week === outDayName);
  if (!curfew) return false;

  // Get sign-in time in house TZ
  const inInTz = new Date(signInDate.toLocaleString("en-US", { timeZone: tz }));

  // If the sign-in is on a different calendar day, it's past curfew (missed)
  const outDateStr = `${outInTz.getFullYear()}-${String(outInTz.getMonth() + 1).padStart(2, "0")}-${String(outInTz.getDate()).padStart(2, "0")}`;
  const inDateStr = `${inInTz.getFullYear()}-${String(inInTz.getMonth() + 1).padStart(2, "0")}-${String(inInTz.getDate()).padStart(2, "0")}`;

  if (inDateStr !== outDateStr) return true;

  // Same calendar day — check if sign-in falls within the curfew window.
  const startTime = curfew.curfew_start_time ?? curfew.curfew_time;
  const endTime = curfew.curfew_time;
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const inH = inInTz.getHours();
  const inM = inInTz.getMinutes();

  const inMinutes = inH * 60 + inM;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes > endMinutes) {
    // Overnight window (e.g. 23:59 → 06:00): past curfew if time >= start OR time < end
    return inMinutes >= startMinutes || inMinutes < endMinutes;
  }
  // Same-day window (e.g. 22:00 → 23:59): past curfew if time >= start
  return inMinutes >= startMinutes;
}
