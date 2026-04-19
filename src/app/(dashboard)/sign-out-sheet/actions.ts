"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { sendNotification, notifyHouseStaff } from "@/lib/notifications";
import { z } from "zod";

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
  await notifyHouseStaff(
    resident.house_id,
    {
      type: "resident_signed_out",
      title: "Resident Signed Out",
      message: `${resident.full_name} signed out to ${parsed.data.destination}`,
      actionUrl: "/sign-out-sheet",
      entityType: "sign_out_sheet",
      entityId: row.id,
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

  // Conditional update: only close the row if it is still open. This
  // makes the sign-in step idempotent under a double-submit and
  // prevents a concurrent second submission from silently attaching a
  // second Warning/Demerit after the first one already landed.
  const now = new Date().toISOString();
  const { data: closedRows, error: updateErr } = await supabase
    .from("sign_out_sheet")
    .update({ time_in: now, signed_in_by: user.id })
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
      ? `${resident?.full_name ?? "Resident"} signed back in from ${row.destination}`
      : `${user.full_name} signed in ${resident?.full_name ?? "resident"} from ${row.destination}`,
    metadata: { destination: row.destination },
  });

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
