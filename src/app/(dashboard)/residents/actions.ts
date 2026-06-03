"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import {
  createResidentSchema,
  updateResidentSchema,
  createNoteSchema,
  transferResidentSchema,
} from "@/lib/validations";
import { sendNotification } from "@/lib/notifications";
import { getHouseToday } from "@/lib/timezone";
import { sendReinstateEmail, sendApplicationEmail } from "@/lib/email";
import { getAppOrigin } from "@/lib/app-url";

// Shapes returned by PostgREST joins. TS can't parse the select string,
// so we narrow the joined rows centrally instead of casting at each access.
type RoomJoin = { house_id?: string; name?: string } | null;
type BedWithRoom = {
  id?: string;
  label?: string | null;
  room: RoomJoin;
} | null;
type BedAssignmentWithBed = {
  resident_id: string;
  bed_id: string;
  bed: { label?: string | null; room: { name?: string; house_id?: string } | null } | null;
} | null;

// --- Residents ---

export async function createResident(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createResidentSchema.safeParse({
    house_id: formData.get("house_id"),
    full_name: formData.get("full_name"),
    date_of_birth: formData.get("date_of_birth") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    emergency_contact_name: formData.get("emergency_contact_name"),
    emergency_contact_phone: formData.get("emergency_contact_phone"),
    emergency_contact_relationship:
      formData.get("emergency_contact_relationship") || undefined,
    sobriety_date: formData.get("sobriety_date") || undefined,
    move_in_date: formData.get("move_in_date"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  if (
    user.role !== "admin" &&
    !canAccessHouse(user, parsed.data.house_id)
  ) {
    return { error: "Not authorized for this house" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("residents")
    .insert({
      ...parsed.data,
      status: "active",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: parsed.data.house_id,
    residentId: data.id,
    actorId: user.id,
    eventType: "move_in",
    entityType: "resident",
    entityId: data.id,
    description: `${parsed.data.full_name} moved in, added by ${user.full_name}`,
  });

  revalidatePath("/residents");
  revalidatePath(`/houses/${parsed.data.house_id}`);
  redirect(`/residents/${data.id}`);
}

export async function updateResident(residentId: string, formData: FormData) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id")
    .eq("id", residentId)
    .maybeSingle();

  if (!resident) return { error: "Resident not found" };
  if (
    user.role !== "admin" &&
    !canAccessHouse(user, resident.house_id)
  ) {
    return { error: "Not authorized" };
  }

  // Use null for cleared fields (empty string) vs undefined for absent fields
  function fieldVal(key: string): string | null | undefined {
    if (!formData.has(key)) return undefined; // field absent — don't update
    const v = formData.get(key) as string;
    return v === "" ? null : v; // empty string — clear to null
  }

  const parsed = updateResidentSchema.safeParse({
    full_name: formData.get("full_name") || undefined, // name should never be cleared
    date_of_birth: fieldVal("date_of_birth"),
    phone: fieldVal("phone"),
    email: fieldVal("email"),
    emergency_contact_name: fieldVal("emergency_contact_name"),
    emergency_contact_phone: fieldVal("emergency_contact_phone"),
    emergency_contact_relationship: fieldVal("emergency_contact_relationship"),
    sobriety_date: fieldVal("sobriety_date"),
    // move_in_date must always have a value — never write an empty
    // string back; skip the key when blank so the DB keeps its value.
    move_in_date: formData.get("move_in_date") || undefined,
    move_out_date: fieldVal("move_out_date"),
    notes: fieldVal("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { error } = await supabase
    .from("residents")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", residentId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: resident.house_id,
    residentId,
    actorId: user.id,
    eventType: "resident_updated",
    entityType: "resident",
    entityId: residentId,
    description: `Resident profile updated by ${user.full_name}`,
  });

  revalidatePath(`/residents/${residentId}`);
  return {};
}

export async function dischargeResident(
  residentId: string,
  reason?: string,
  isVoluntary?: boolean
) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", residentId)
    .maybeSingle();

  if (!resident) return { error: "Resident not found" };
  if (
    user.role !== "admin" &&
    !canAccessHouse(user, resident.house_id)
  ) {
    return { error: "Not authorized" };
  }

  const dischargeDate = getHouseToday();
  const nowIso = new Date().toISOString();

  // Grab the linked auth user_id up front so we can clear their
  // bulletin / social content below. The resident row stays (so the
  // login, email/password, and their documents survive) — we're just
  // wiping the things that represent active house participation.
  const { data: residentLink } = await supabase
    .from("residents")
    .select("user_id")
    .eq("id", residentId)
    .maybeSingle();
  const residentUserId = residentLink?.user_id ?? null;

  // ── Flip status FIRST ────────────────────────────────────────
  // We intentionally mark the resident as discharged before running
  // any destructive cleanup. If this update fails (transient DB
  // hiccup, RLS change, etc.) we bail early with nothing destroyed,
  // so the retry path is safe and the resident's discipline / chore
  // / bulletin / activity data stays intact. Preserved regardless:
  // intake_forms, signed house_commitments (plus their PDFs in the
  // bucket), payments ledger, auth user (email + password), and the
  // activity_log audit trail.
  const { error } = await supabase
    .from("residents")
    .update({
      status: "discharged",
      move_out_date: dischargeDate,
      discharge_reason: reason || null,
      discharge_is_voluntary: isVoluntary ?? false,
      updated_at: nowIso,
    })
    .eq("id", residentId);

  if (error) return { error: error.message };

  // End all active bed assignments
  await supabase
    .from("bed_assignments")
    .update({ end_date: dischargeDate })
    .eq("resident_id", residentId)
    .is("end_date", null);

  // Close any open sign-out row (defensive — delete wipes the whole
  // history right after, this prevents stray open rows during the
  // transition if RLS blocks the delete for some reason).
  await supabase
    .from("sign_out_sheet")
    .update({ time_in: nowIso, signed_in_by: user.id })
    .eq("resident_id", residentId)
    .is("time_in", null);

  // ── Discipline ───────────────────────────────────────────────
  // A returning resident gets a clean slate. Warnings, demerits,
  // incidents, and restrictions are wiped. Staff still have the
  // activity_log as an audit trail of the original events.
  await supabase.from("warnings").delete().eq("resident_id", residentId);
  await supabase.from("demerits").delete().eq("resident_id", residentId);
  await supabase.from("incidents").delete().eq("resident_id", residentId);
  await supabase.from("restrictions").delete().eq("resident_id", residentId);

  // ── Chore participation ──────────────────────────────────────
  // Pull the resident out of every current/future rotation and wipe
  // completion history so they don't appear on the house board.
  // chore_signoffs cascade from chore_rotation_assignments.
  await supabase
    .from("chore_rotation_assignments")
    .delete()
    .eq("resident_id", residentId);
  await supabase
    .from("chore_completions")
    .delete()
    .eq("resident_id", residentId);
  await supabase
    .from("chore_exclusions")
    .delete()
    .eq("resident_id", residentId);

  // ── Activity records ─────────────────────────────────────────
  // Leave requests, sign-out rows, check-in responses, resident
  // notes, safety assessments — all represent in-flight state of
  // the resident's stay. Wipe them so a returning resident starts
  // fresh.
  await supabase
    .from("leave_requests")
    .delete()
    .eq("resident_id", residentId);
  await supabase.from("sign_out_sheet").delete().eq("resident_id", residentId);
  await supabase
    .from("check_in_responses")
    .delete()
    .eq("resident_id", residentId);
  await supabase.from("resident_notes").delete().eq("resident_id", residentId);
  await supabase
    .from("safety_assessments")
    .delete()
    .eq("resident_id", residentId);

  // ── Cancel in-flight commitments ─────────────────────────────
  // The signed PDF + history stays in the documents bucket and the
  // row itself survives (for future reference when they move back
  // in), but we flip status to 'cancelled' so the rent-charge
  // generator stops producing new weekly/monthly charges against
  // this resident.
  await supabase
    .from("house_commitments")
    .update({ status: "cancelled", updated_at: nowIso })
    .eq("resident_id", residentId)
    .in("status", [
      "active",
      "pending_staff_signature",
      "pending_resident_signature",
    ]);

  // ── Void unpaid / future-dated charges ───────────────────────
  // Paid charges stay (ledger history). Open / partially paid ones
  // would otherwise keep surfacing as "past due" forever on reports.
  // `status` is constrained to ('open','paid','partial','void') —
  // we delete the non-closed states so the ledger only retains
  // settled activity for this discharged resident.
  await supabase
    .from("payment_charges")
    .delete()
    .eq("resident_id", residentId)
    .in("status", ["open", "partial"]);

  // ── Bulletin / social content (linked via user_id) ───────────
  // Posts, comments, likes, ride-share reservations, grievances,
  // blocker acknowledgments, and sobriety milestone posts by this
  // user all get wiped so the house feed isn't cluttered with a
  // discharged resident's content.
  if (residentUserId) {
    await supabase
      .from("bulletin_likes")
      .delete()
      .eq("user_id", residentUserId);
    await supabase
      .from("bulletin_comments")
      .delete()
      .eq("user_id", residentUserId);
    await supabase
      .from("bulletin_posts")
      .delete()
      .eq("user_id", residentUserId);
    await supabase
      .from("ride_share_reservations")
      .delete()
      .eq("user_id", residentUserId);
    await supabase
      .from("ride_shares")
      .delete()
      .eq("user_id", residentUserId);
    await supabase
      .from("grievances")
      .delete()
      .eq("user_id", residentUserId);
    await supabase
      .from("blocker_acknowledgments")
      .delete()
      .eq("user_id", residentUserId);
    await supabase
      .from("sobriety_milestone_posts")
      .delete()
      .eq("user_id", residentUserId);
    await supabase
      .from("notifications")
      .delete()
      .eq("user_id", residentUserId);
  }

  const voluntaryText = isVoluntary ? " (voluntary)" : "";
  const reasonText = reason ? ` — Reason: ${reason}` : "";
  await logActivity({
    houseId: resident.house_id,
    residentId,
    actorId: user.id,
    eventType: "move_out",
    entityType: "resident",
    entityId: residentId,
    description: `${resident.full_name} discharged${voluntaryText} by ${user.full_name}${reasonText}`,
  });

  // Notify the resident about their own discharge. Kept minimal — if the
  // discharge was involuntary and sensitive, the reason is redacted here
  // (staff can still see full details in the activity log).
  if (residentUserId) {
    await sendNotification({
      userId: residentUserId,
      type: "discharge",
      title: isVoluntary ? "Departure Recorded" : "Discharge Recorded",
      message: isVoluntary
        ? "Your voluntary departure has been recorded."
        : "Your discharge has been recorded. Please contact house staff with any questions.",
      entityType: "resident",
      entityId: residentId,
    });
  }

  revalidatePath(`/residents/${residentId}`);
  revalidatePath(`/houses/${resident.house_id}`);
  revalidatePath("/residents");
  return {};
}

export async function deleteResident(residentId: string) {
  const user = await requireAuth();
  if (user.role !== "admin") {
    return { error: "Only admins can delete residents" };
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", residentId)
    .maybeSingle();

  if (!resident) return { error: "Resident not found" };

  // Block hard-delete if the resident has any real history. We check
  // the tables where a cascade would destroy compliance-relevant
  // records (or raw FK errors would surface to the user). Staff
  // should Discharge instead, which preserves history.
  const historyChecks = await Promise.all([
    supabase
      .from("warnings")
      .select("id", { head: true, count: "exact" })
      .eq("resident_id", residentId)
      .limit(1),
    supabase
      .from("demerits")
      .select("id", { head: true, count: "exact" })
      .eq("resident_id", residentId)
      .limit(1),
    supabase
      .from("payment_charges")
      .select("id", { head: true, count: "exact" })
      .eq("resident_id", residentId)
      .limit(1),
    supabase
      .from("incidents")
      .select("id", { head: true, count: "exact" })
      .eq("resident_id", residentId)
      .limit(1),
    supabase
      .from("leave_requests")
      .select("id", { head: true, count: "exact" })
      .eq("resident_id", residentId)
      .limit(1),
    supabase
      .from("sign_out_sheet")
      .select("id", { head: true, count: "exact" })
      .eq("resident_id", residentId)
      .limit(1),
  ]);
  // Fail CLOSED on errors: if any of the 6 history checks errored
  // (transient DB hiccup, timeout, etc.) treat it as "unknown, don't
  // delete" rather than "no history found", otherwise the guard is
  // silently bypassed and the subsequent .delete() would cascade
  // destroy compliance records.
  const hasError = historyChecks.some((r) => r.error);
  if (hasError) {
    return {
      error:
        "Unable to verify resident history right now. Please try again.",
    };
  }
  const hasHistory = historyChecks.some((r) => (r.count ?? 0) > 0);
  if (hasHistory) {
    return {
      error:
        "This resident has discipline, payment, or activity history. Use Discharge to preserve records instead of deleting.",
    };
  }

  // End all active bed assignments
  await supabase
    .from("bed_assignments")
    .update({ end_date: getHouseToday() })
    .eq("resident_id", residentId)
    .is("end_date", null);

  // Delete the resident
  const { error } = await supabase
    .from("residents")
    .delete()
    .eq("id", residentId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: resident.house_id,
    actorId: user.id,
    eventType: "resident_deleted",
    entityType: "resident",
    entityId: residentId,
    description: `${resident.full_name} deleted by ${user.full_name}`,
  });

  revalidatePath("/residents");
  revalidatePath(`/houses/${resident.house_id}`);
  return {};
}

export async function deleteIntakeUser(userId: string) {
  const currentUser = await requireAuth();
  if (currentUser.role !== "admin") {
    return { error: "Only admins can delete intake entries" };
  }
  if (!currentUser.workspace_id) {
    return { error: "No workspace context" };
  }

  const adminClient = createAdminClient();

  const { data: target } = await adminClient
    .from("users")
    .select("id, full_name, commitment_signed")
    .eq("id", userId)
    .eq("workspace_id", currentUser.workspace_id)
    .maybeSingle();

  if (!target) return { error: "User not found" };
  if (target.commitment_signed) {
    return { error: "Cannot delete a user who has already signed their commitment. Use discharge instead." };
  }

  // Remove workspace membership
  if (currentUser.workspace_id) {
    await adminClient
      .from("workspace_members")
      .delete()
      .eq("user_id", userId)
      .eq("workspace_id", currentUser.workspace_id);
  }

  // Remove notifications, user roles, and the user record
  await adminClient.from("notifications").delete().eq("user_id", userId);
  await adminClient.from("user_roles").delete().eq("user_id", userId);

  // Remove any resident record that was created during intake
  await adminClient.from("residents").delete().eq("user_id", userId);

  // Remove house commitments created during intake
  await adminClient.from("house_commitments").delete().eq("user_id", userId);

  // Delete the users row (which also cascades the auth user via trigger)
  const { error } = await adminClient.from("users").delete().eq("id", userId);
  if (error) return { error: error.message };

  await logActivity({
    actorId: currentUser.id,
    eventType: "intake_user_deleted",
    entityType: "user",
    entityId: userId,
    description: `Intake entry for ${target.full_name} deleted by ${currentUser.full_name}`,
  });

  revalidatePath("/residents");
  return {};
}

// --- Transfer resident to another house ---

/**
 * Move a resident from one house to another.
 *
 * Historical records (warnings, demerits, payment charges, activity
 * log, completed chore signoffs, past leave requests, past bed
 * assignments, past sign-outs) remain attached to the OLD house for
 * compliance and reporting. Only in-flight state migrates — the
 * resident should show up in the new house with a clean slate.
 *
 * Cleared on transfer:
 *   - active bed assignment(s) in old house (end_date = today)
 *   - open sign-out row (time_in = now())
 *   - current & future chore rotation assignments (cascades signoffs)
 *   - pending / approved leave requests (status = 'denied', staff note)
 *   - active discipline restrictions (is_active = false, end_date)
 *   - pending/in-flight house commitments (status = 'cancelled')
 *
 * Then:
 *   - residents.house_id = target
 *   - optional insert of new bed_assignment in target house
 *   - activity_log rows written in BOTH houses
 *
 * Admin-only by convention (see UI gate + check below). Managers
 * can't transfer because they typically only have access to one
 * side of the move.
 */
export async function transferResident(
  residentId: string,
  targetHouseId: string,
  targetBedId: string | null | undefined
) {
  const user = await requireAuth();
  if (user.role !== "admin") {
    return { error: "Only admins can transfer residents between houses" };
  }

  const parsed = transferResidentSchema.safeParse({
    resident_id: residentId,
    target_house_id: targetHouseId,
    target_bed_id: targetBedId || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("id, house_id, full_name, status, user_id")
    .eq("id", residentId)
    .maybeSingle();

  if (!resident) return { error: "Resident not found" };
  if (resident.status !== "active") {
    return { error: "Only active residents can be transferred" };
  }
  if (resident.house_id === targetHouseId) {
    return { error: "Resident is already in that house" };
  }

  const sourceHouseId: string = resident.house_id;

  // Verify target house exists + is active.
  const { data: targetHouse } = await supabase
    .from("houses")
    .select("id, name, is_active")
    .eq("id", targetHouseId)
    .maybeSingle();
  if (!targetHouse || !targetHouse.is_active) {
    return { error: "Target house is not available" };
  }

  // Verify source house name for the activity log description.
  const { data: sourceHouse } = await supabase
    .from("houses")
    .select("name")
    .eq("id", sourceHouseId)
    .maybeSingle();

  // Pre-flight: if a target bed was requested, make sure it belongs
  // to the target house and is free. Final race protection is the
  // 23505 catch on the insert at the bottom.
  const cleanTargetBedId = targetBedId || null;
  if (cleanTargetBedId) {
    const { data: rawBed } = await supabase
      .from("beds")
      .select("id, label, room:rooms(house_id, name)")
      .eq("id", cleanTargetBedId)
      .maybeSingle();

    const bed = rawBed as unknown as BedWithRoom;
    const bedHouseId = bed?.room?.house_id;
    if (!bed || bedHouseId !== targetHouseId) {
      return { error: "Selected bed does not belong to the target house" };
    }

    const { data: occupied } = await supabase
      .from("bed_assignments")
      .select("id")
      .eq("bed_id", cleanTargetBedId)
      .is("end_date", null)
      .maybeSingle();
    if (occupied) {
      return { error: "That bed is already occupied" };
    }
  }

  const today = getHouseToday();
  const nowIso = new Date().toISOString();

  // 1. Vacate active bed assignment(s) in the old house.
  await supabase
    .from("bed_assignments")
    .update({ end_date: today })
    .eq("resident_id", residentId)
    .is("end_date", null);

  // 2. Close any open sign-out row.
  await supabase
    .from("sign_out_sheet")
    .update({ time_in: nowIso, signed_in_by: user.id })
    .eq("resident_id", residentId)
    .is("time_in", null);

  // 3. Remove the resident from CURRENT chore rotation assignments in
  //    the old house. We deliberately skip past (is_current = false)
  //    rotations — their assignments + cascaded chore_signoffs are
  //    historical records that should stay with the old house, same
  //    as warnings/demerits/payments. `chore_rotation_assignments`
  //    doesn't carry a house_id directly so we filter by the
  //    rotation → house join.
  const { data: oldHouseRotations } = await supabase
    .from("chore_rotations")
    .select("id")
    .eq("house_id", sourceHouseId)
    .eq("is_current", true);
  const rotationIds = (oldHouseRotations ?? []).map((r) => r.id);
  if (rotationIds.length > 0) {
    await supabase
      .from("chore_rotation_assignments")
      .delete()
      .eq("resident_id", residentId)
      .in("rotation_id", rotationIds);
  }

  // 4. Deny pending / approved leave requests still associated with
  //    the old house. We avoid deleting so the history stays with
  //    the source house.
  await supabase
    .from("leave_requests")
    .update({
      status: "denied",
      denial_reason: "Resident transferred to another house",
      denied_by: user.id,
      denied_at: nowIso,
      updated_at: nowIso,
    })
    .eq("resident_id", residentId)
    .in("status", ["pending", "approved"]);

  // 5. End active restrictions scoped to the old house.
  await supabase
    .from("restrictions")
    .update({
      is_active: false,
      end_date: today,
      updated_at: nowIso,
    })
    .eq("resident_id", residentId)
    .eq("house_id", sourceHouseId)
    .eq("is_active", true);

  // 6. Cancel in-flight house commitments (not yet signed off).
  //    'active' commitments stay — they represent a signed
  //    agreement that's part of the resident's historical record
  //    with the old house.
  await supabase
    .from("house_commitments")
    .update({ status: "cancelled", updated_at: nowIso })
    .eq("resident_id", residentId)
    .in("status", ["pending_staff_signature", "pending_resident_signature"]);

  // 7. Flip the resident over to the target house.
  const { error: moveError } = await supabase
    .from("residents")
    .update({
      house_id: targetHouseId,
      updated_at: nowIso,
    })
    .eq("id", residentId);

  if (moveError) return { error: moveError.message };

  // 8. If a target bed was chosen, insert the new assignment.
  //    Uses insert-first pattern (mirrors changeResidentBed) so a
  //    race-induced 23505 from the partial unique index doesn't
  //    leave the resident with no bed.
  let newBedAssignmentId: string | null = null;
  if (cleanTargetBedId) {
    const { data: inserted, error: bedError } = await supabase
      .from("bed_assignments")
      .insert({
        resident_id: residentId,
        bed_id: cleanTargetBedId,
        start_date: today,
        assigned_by: user.id,
      })
      .select("id")
      .single();

    if (bedError) {
      // Transfer itself succeeded (resident is already in the new
      // house); the bed race is surfaced as a soft warning so the
      // caller can pick another bed without retrying the whole
      // transfer.
      if (bedError.code === "23505") {
        return {
          warning:
            "Resident transferred, but that bed was just taken. Assign a bed from the new house page.",
          newHouseId: targetHouseId,
        };
      }
      return {
        warning: `Resident transferred, but bed assignment failed: ${bedError.message}`,
        newHouseId: targetHouseId,
      };
    }
    newBedAssignmentId = inserted?.id ?? null;
  }

  // 9. Activity log — one entry in each house so both audit trails
  //    reflect the move.
  const sourceName = sourceHouse?.name ?? "previous house";
  const targetName = targetHouse.name;
  await Promise.all([
    logActivity({
      houseId: sourceHouseId,
      residentId,
      actorId: user.id,
      eventType: "resident_transferred_out",
      entityType: "resident",
      entityId: residentId,
      description: `${resident.full_name} transferred out to ${targetName} by ${user.full_name}`,
      metadata: { target_house_id: targetHouseId },
    }),
    logActivity({
      houseId: targetHouseId,
      residentId,
      actorId: user.id,
      eventType: "resident_transferred_in",
      entityType: "resident",
      entityId: residentId,
      description: `${resident.full_name} transferred in from ${sourceName} by ${user.full_name}`,
      metadata: { source_house_id: sourceHouseId, bed_assignment_id: newBedAssignmentId },
    }),
  ]);

  // 10. Notify the resident.
  if (resident.user_id) {
    await sendNotification({
      userId: resident.user_id,
      type: "house_transfer",
      title: "House Transfer",
      message: `You were moved to ${targetName}.`,
      actionUrl: `/houses/${targetHouseId}`,
      entityType: "resident",
      entityId: residentId,
    });
  }

  revalidatePath(`/residents/${residentId}`);
  revalidatePath(`/residents`);
  revalidatePath(`/houses/${sourceHouseId}`);
  revalidatePath(`/houses/${targetHouseId}`);
  revalidatePath(`/activity`);
  return { newHouseId: targetHouseId };
}

// --- Force Photo Toggle ---

export async function updateResidentForcePhoto(
  residentId: string,
  forcePhoto: boolean
) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", residentId)
    .maybeSingle();

  if (!resident) return { error: "Resident not found" };
  if (user.role !== "admin" && !canAccessHouse(user, resident.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("residents")
    .update({ force_photo: forcePhoto, updated_at: new Date().toISOString() })
    .eq("id", residentId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: resident.house_id,
    residentId,
    actorId: user.id,
    eventType: "resident_updated",
    entityType: "resident",
    entityId: residentId,
    description: `Force photo ${forcePhoto ? "enabled" : "disabled"} for ${resident.full_name} by ${user.full_name}`,
  });

  revalidatePath(`/residents/${residentId}`);
  return {};
}

// --- Bed Assignments ---

export async function assignBed(
  residentId: string,
  bedId: string,
  houseId: string
) {
  const user = await requireAuth();

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // Check bed is not already occupied. Final race-proofing comes from
  // the partial unique index on bed_assignments(bed_id) WHERE end_date
  // IS NULL; this SELECT is just for the friendly pre-flight error.
  const { data: existingAssignment } = await supabase
    .from("bed_assignments")
    .select("id")
    .eq("bed_id", bedId)
    .is("end_date", null)
    .maybeSingle();

  if (existingAssignment) {
    return { error: "This bed is already occupied" };
  }

  // Check resident doesn't already have 2 active assignments
  const { data: residentAssignments } = await supabase
    .from("bed_assignments")
    .select("id")
    .eq("resident_id", residentId)
    .is("end_date", null);

  if (residentAssignments && residentAssignments.length >= 2) {
    return { error: "Resident already has 2 bed assignments (max for private room)" };
  }

  const { data, error } = await supabase
    .from("bed_assignments")
    .insert({
      resident_id: residentId,
      bed_id: bedId,
      start_date: getHouseToday(),
      assigned_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "This bed is already occupied" };
    }
    return { error: error.message };
  }

  // Get bed details for logging
  const { data: rawBed } = await supabase
    .from("beds")
    .select("label, room:rooms(name)")
    .eq("id", bedId)
    .maybeSingle();
  const bed = rawBed as unknown as BedWithRoom;

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name")
    .eq("id", residentId)
    .maybeSingle();

  await logActivity({
    houseId,
    residentId,
    actorId: user.id,
    eventType: "bed_assigned",
    entityType: "bed_assignment",
    entityId: data.id,
    description: `${resident?.full_name} assigned to ${bed?.room?.name} / ${bed?.label} by ${user.full_name}`,
    metadata: { bed_id: bedId },
  });

  const { data: residentUser } = await supabase
    .from("residents")
    .select("user_id")
    .eq("id", residentId)
    .maybeSingle();

  if (residentUser?.user_id) {
    const roomName = bed?.room?.name ?? "your room";
    await sendNotification({
      userId: residentUser.user_id,
      type: "bed_assigned",
      title: "Bed Assigned",
      message: `You were assigned to ${roomName} / ${bed?.label ?? "a bed"}.`,
      actionUrl: `/houses/${houseId}`,
      entityType: "bed_assignment",
      entityId: data.id,
    });
  }

  revalidatePath(`/houses/${houseId}`);
  revalidatePath(`/residents/${residentId}`);
  return {};
}

/**
 * Change a resident's current bed.
 *
 * - Vacates any active bed assignment(s) for the resident.
 * - If `bedId` is provided, assigns them to that bed.
 * - If `bedId` is null/empty, the resident is left with no specific bed
 *   (i.e., occupying the room as a "private room" / no bed association).
 */
export async function changeResidentBed(
  residentId: string,
  bedId: string | null,
  houseId: string
) {
  const user = await requireAuth();

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // If a target bed is specified, make sure it's free first so we don't
  // vacate the resident and then fail to reassign.
  if (bedId) {
    const { data: occupied } = await supabase
      .from("bed_assignments")
      .select("id, resident_id")
      .eq("bed_id", bedId)
      .is("end_date", null)
      .maybeSingle();

    if (occupied && occupied.resident_id !== residentId) {
      return { error: "This bed is already occupied" };
    }
    if (occupied && occupied.resident_id === residentId) {
      // Resident is already in that bed — nothing to do.
      return {};
    }
  }

  const today = getHouseToday();

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name")
    .eq("id", residentId)
    .maybeSingle();

  if (bedId) {
    // Insert the new bed assignment FIRST so that a race-induced
    // 23505 from the partial unique index on bed_assignments(bed_id)
    // WHERE end_date IS NULL cannot leave the resident with no bed.
    // (The resident briefly has two active rows; we close the old
    // ones immediately below.)
    const { data, error } = await supabase
      .from("bed_assignments")
      .insert({
        resident_id: residentId,
        bed_id: bedId,
        start_date: today,
        assigned_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { error: "This bed is already occupied" };
      }
      return { error: error.message };
    }

    // New row is committed; now close the resident's other active
    // assignments. If this update fails the resident ends up with
    // two active beds — harmless and trivially cleanable — which is
    // far better than the previous ordering, which could leave them
    // with zero.
    const { error: vacateError } = await supabase
      .from("bed_assignments")
      .update({ end_date: today })
      .eq("resident_id", residentId)
      .is("end_date", null)
      .neq("id", data.id);

    if (vacateError) return { error: vacateError.message };

    const { data: rawBed } = await supabase
      .from("beds")
      .select("label, room:rooms(name)")
      .eq("id", bedId)
      .maybeSingle();
    const bed = rawBed as unknown as BedWithRoom;

    await logActivity({
      houseId,
      residentId,
      actorId: user.id,
      eventType: "bed_assigned",
      entityType: "bed_assignment",
      entityId: data.id,
      description: `${resident?.full_name} moved to ${bed?.room?.name} / ${bed?.label} by ${user.full_name}`,
      metadata: { bed_id: bedId },
    });

    const { data: residentUser } = await supabase
      .from("residents")
      .select("user_id")
      .eq("id", residentId)
      .maybeSingle();

    if (residentUser?.user_id) {
      const roomName = bed?.room?.name ?? "your room";
      await sendNotification({
        userId: residentUser.user_id,
        type: "bed_changed",
        title: "Bed Changed",
        message: `You were moved to ${roomName} / ${bed?.label ?? "a bed"}.`,
        actionUrl: `/houses/${houseId}`,
        entityType: "bed_assignment",
        entityId: data.id,
      });
    }
  } else {
    // No target bed — just vacate any active beds for this resident.
    const { error: vacateError } = await supabase
      .from("bed_assignments")
      .update({ end_date: today })
      .eq("resident_id", residentId)
      .is("end_date", null);

    if (vacateError) return { error: vacateError.message };

    await logActivity({
      houseId,
      residentId,
      actorId: user.id,
      eventType: "bed_vacated",
      entityType: "resident",
      entityId: residentId,
      description: `${resident?.full_name} set to no specific bed (private room) by ${user.full_name}`,
    });
  }

  revalidatePath(`/houses/${houseId}`);
  revalidatePath(`/residents/${residentId}`);
  return {};
}

export async function vacateBed(assignmentId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: rawAssignment } = await supabase
    .from("bed_assignments")
    .select("resident_id, bed_id, bed:beds(label, room:rooms(name, house_id))")
    .eq("id", assignmentId)
    .maybeSingle();

  const assignment = rawAssignment as unknown as BedAssignmentWithBed;
  if (!assignment) return { error: "Assignment not found" };

  const houseId = assignment.bed?.room?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("bed_assignments")
    .update({ end_date: getHouseToday() })
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    residentId: assignment.resident_id,
    actorId: user.id,
    eventType: "bed_vacated",
    entityType: "bed_assignment",
    entityId: assignmentId,
    description: `Bed vacated by ${user.full_name}`,
  });

  revalidatePath(`/houses/${houseId}`);
  revalidatePath(`/residents/${assignment.resident_id}`);
  return {};
}

// --- Notes ---

export async function createNote(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createNoteSchema.safeParse({
    resident_id: formData.get("resident_id"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", parsed.data.resident_id)
    .maybeSingle();

  if (!resident) return { error: "Resident not found" };
  if (
    user.role !== "admin" &&
    !canAccessHouse(user, resident.house_id)
  ) {
    return { error: "Not authorized" };
  }

  const { data, error } = await supabase
    .from("resident_notes")
    .insert({
      resident_id: parsed.data.resident_id,
      author_id: user.id,
      content: parsed.data.content,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: resident.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "note_added",
    entityType: "resident_note",
    entityId: data.id,
    description: `Note added to ${resident.full_name} by ${user.full_name}`,
  });

  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return {};
}

// ── Reinstate a discharged resident ─────────────────────────────
// Treats reinstatement as a fresh sign-in: resets intake/commitment
// flags so the resident must redo onboarding per workspace settings.

export async function reinstateResident(
  residentId: string,
  houseId: string
) {
  const user = await requireAuth();
  if (user.role !== "admin") {
    return { error: "Only admins can reinstate residents" };
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("id, full_name, house_id, status, user_id")
    .eq("id", residentId)
    .maybeSingle();

  if (!resident) return { error: "Resident not found" };
  if (resident.status !== "discharged") {
    return { error: "Only discharged residents can be reinstated" };
  }

  const residentUserId = resident.user_id as string | null;

  // Flip the resident back to active in the new house
  const nowIso = new Date().toISOString();
  const today = getHouseToday();
  const { error: updateError } = await supabase
    .from("residents")
    .update({
      status: "active",
      house_id: houseId,
      move_in_date: today,
      move_out_date: null,
      discharge_reason: null,
      discharge_is_voluntary: false,
      updated_at: nowIso,
    })
    .eq("id", residentId);

  if (updateError) return { error: updateError.message };

  // Reset intake/commitment on the user record so they go through
  // the full onboarding flow again (the intake page checks these).
  if (residentUserId) {
    await adminClient
      .from("users")
      .update({
        intake_completed: false,
        commitment_signed: false,
        updated_at: nowIso,
      })
      .eq("id", residentUserId);

    // Delete old intake form so the wizard starts fresh
    await adminClient
      .from("intake_forms")
      .delete()
      .eq("user_id", residentUserId);

    // Cancel any leftover commitment rows (cancelled ones from
    // discharge stay for history; pending ones should be removed)
    await adminClient
      .from("house_commitments")
      .delete()
      .eq("user_id", residentUserId)
      .in("status", ["pending_resident_signature", "pending_staff_signature"]);

    // Send reinstatement email
    const { data: userRecord } = await adminClient
      .from("users")
      .select("email, full_name")
      .eq("id", residentUserId)
      .maybeSingle();

    if (userRecord?.email) {
      try {
        const appUrl = await getAppOrigin();
        await sendReinstateEmail({
          to: userRecord.email,
          fullName: userRecord.full_name || userRecord.email,
          appUrl,
        });
      } catch {
        // Email failure shouldn't block the reinstatement
      }
    }

    // Notify the resident
    await sendNotification({
      userId: residentUserId,
      type: "reinstatement",
      title: "Account Reinstated",
      message:
        "Your account has been reinstated. Please log in to complete onboarding.",
      entityType: "resident",
      entityId: residentId,
    });
  }

  await logActivity({
    houseId,
    residentId,
    actorId: user.id,
    eventType: "reinstatement",
    entityType: "resident",
    entityId: residentId,
    description: `${resident.full_name} reinstated by ${user.full_name}`,
  });

  revalidatePath(`/residents/${residentId}`);
  revalidatePath(`/houses/${houseId}`);
  revalidatePath("/residents");
  return {};
}

// ── Resend application / intake packet to an existing resident ──
// Resets the user's intake_completed flag and sends an email prompting
// them to fill out the intake form. They'll be routed to the intake
// wizard on next login until they complete it.

export async function resendApplicationToResident(residentId: string) {
  const currentUser = await requireAuth();
  if (currentUser.role !== "admin") {
    return { error: "Only admins can resend applications" };
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("id, full_name, user_id, house_id, status")
    .eq("id", residentId)
    .maybeSingle();

  if (!resident) return { error: "Resident not found" };
  if (resident.status !== "active") {
    return { error: "Can only resend applications to active residents" };
  }

  const residentUserId = resident.user_id as string | null;
  if (!residentUserId) {
    return { error: "Resident has no linked user account" };
  }

  // Reset intake so the resident is routed to the intake wizard.
  // Keep commitment_signed untouched — this is a redo of the application
  // only, not a full re-intake (no bed reassignment needed).
  await adminClient
    .from("users")
    .update({
      intake_completed: false,
      application_resent: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", residentUserId);

  // Delete old intake form draft/completed so the wizard starts fresh
  await adminClient
    .from("intake_forms")
    .delete()
    .eq("user_id", residentUserId);

  // Send the application email
  const { data: userRecord } = await adminClient
    .from("users")
    .select("email, full_name")
    .eq("id", residentUserId)
    .maybeSingle();

  if (userRecord?.email) {
    try {
      const appUrl = await getAppOrigin();
      await sendApplicationEmail({
        to: userRecord.email,
        fullName: userRecord.full_name || userRecord.email,
        appUrl,
      });
    } catch {
      // Email failure shouldn't block the action
    }
  }

  await sendNotification({
    userId: residentUserId,
    type: "application_required",
    title: "Application Required",
    message:
      "You need to complete the intake application. Please log in and follow the prompts.",
    entityType: "resident",
    entityId: residentId,
  });

  await logActivity({
    houseId: resident.house_id,
    residentId,
    actorId: currentUser.id,
    eventType: "application_resent",
    entityType: "resident",
    entityId: residentId,
    description: `Intake application resent to ${resident.full_name} by ${currentUser.full_name}`,
  });

  revalidatePath(`/residents/${residentId}`);
  revalidatePath("/residents");
  return {};
}

// ── Admin sign-off on a resent application ──
// Clears the application_resent flag. No commitment changes needed
// because this is just a redo of the intake form, not a full re-intake.

export async function signOffResendApplication(
  userId: string,
  signoffData: {
    signature: string;
    printedName: string;
    date: string;
    pdfBase64: string;
  }
) {
  const currentUser = await requireAuth();
  if (currentUser.role !== "admin") {
    return { error: "Only admins can sign off on resent applications" };
  }

  const adminClient = createAdminClient();

  const { data: userRow } = await adminClient
    .from("users")
    .select("id, full_name, application_resent")
    .eq("id", userId)
    .maybeSingle();

  if (!userRow) return { error: "User not found" };
  if (!userRow.application_resent) {
    return { error: "No pending resent application for this user" };
  }

  // Store the staff signature on the intake form
  const { data: intakeForm } = await adminClient
    .from("intake_forms")
    .select("id, form_data, signatures")
    .eq("user_id", userId)
    .maybeSingle();

  if (intakeForm) {
    const existingSignatures =
      (intakeForm.signatures as Record<string, string>) ?? {};
    const existingFormData =
      (intakeForm.form_data as Record<string, unknown>) ?? {};

    // Fill staff/witness slots (mirrors submitStaffSignoff logic)
    existingFormData.staff_signed_off_at = new Date().toISOString();
    existingFormData.application_staff_name = signoffData.printedName;
    existingFormData.application_staff_date = signoffData.date;
    existingSignatures.application_staff = signoffData.signature;

    const witnessKeys = [
      "house_rules_policy_witness",
      "good_neighbor_policy_witness",
      "confidentiality_policy_witness",
      "discharge_policy_witness",
    ];
    for (const k of witnessKeys) {
      existingSignatures[k] = signoffData.signature;
      existingFormData[`${k}_date`] = signoffData.date;
    }
    existingSignatures.release_of_information_witness = signoffData.signature;
    existingFormData.roi_witness_printed_name = signoffData.printedName;
    existingFormData.roi_witness_date = signoffData.date;

    await adminClient
      .from("intake_forms")
      .update({
        signatures: existingSignatures,
        form_data: existingFormData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", intakeForm.id);
  }

  // Replace the intake packet PDF in storage with the signed version
  const { data: existingDoc } = await adminClient
    .from("documents")
    .select("id, storage_path")
    .eq("user_id", userId)
    .eq("document_type", "intake_packet")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pdfBuffer = Buffer.from(signoffData.pdfBase64, "base64");
  const fileName =
    existingDoc?.storage_path ??
    `${userId}/intake-packet-${Date.now()}.pdf`;

  const { error: uploadErr } = await adminClient.storage
    .from("documents")
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    return { error: `Could not upload signed packet: ${uploadErr.message}` };
  }

  if (existingDoc) {
    await adminClient
      .from("documents")
      .update({
        file_size: pdfBuffer.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingDoc.id);
  } else {
    await adminClient.from("documents").insert({
      user_id: userId,
      name: "Intake Packet",
      document_type: "intake_packet",
      storage_path: fileName,
      file_size: pdfBuffer.length,
    });
  }

  await adminClient
    .from("users")
    .update({ application_resent: false, updated_at: new Date().toISOString() })
    .eq("id", userId);

  await logActivity({
    actorId: currentUser.id,
    eventType: "resent_application_signed_off",
    entityType: "user",
    entityId: userId,
    description: `${currentUser.full_name} signed off on resent application for ${userRow.full_name}`,
  });

  revalidatePath("/residents");
  return {};
}
