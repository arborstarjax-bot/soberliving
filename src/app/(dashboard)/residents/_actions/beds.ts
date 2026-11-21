"use server";
import { err, okVoid } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { sendNotification } from "@/lib/notifications";
import { getHouseToday } from "@/lib/timezone";
import { getHouseTimezone } from "@/lib/workspace";

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

// Shapes returned by PostgREST joins. TS can't parse the select string,
// so we narrow the joined rows centrally instead of casting at each access.

export async function assignBed(
  residentId: string,
  bedId: string,
  houseId: string
) {
  const user = await requireAuth();

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return err("Not authorized");
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
    return err("This bed is already occupied");
  }

  // Check resident doesn't already have 2 active assignments
  const { data: residentAssignments } = await supabase
    .from("bed_assignments")
    .select("id")
    .eq("resident_id", residentId)
    .is("end_date", null);

  if (residentAssignments && residentAssignments.length >= 2) {
    return err("Resident already has 2 bed assignments (max for private room)");
  }

  const { data, error } = await supabase
    .from("bed_assignments")
    .insert({
      resident_id: residentId,
      bed_id: bedId,
      start_date: getHouseToday(await getHouseTimezone(houseId)),
      assigned_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return err("This bed is already occupied");
    }
    return err(error.message);
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
  return okVoid();
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
    return err("Not authorized");
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
      return err("This bed is already occupied");
    }
    if (occupied && occupied.resident_id === residentId) {
      // Resident is already in that bed — nothing to do.
      return okVoid();
    }
  }

  const today = getHouseToday(await getHouseTimezone(houseId));

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
        return err("This bed is already occupied");
      }
      return err(error.message);
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

    if (vacateError) return err(vacateError.message);

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

    if (vacateError) return err(vacateError.message);

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
  return okVoid();
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
  if (!assignment) return err("Assignment not found");

  const houseId = assignment.bed?.room?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return err("Not authorized");
  }

  const { error } = await supabase
    .from("bed_assignments")
    .update({ end_date: getHouseToday(await getHouseTimezone(houseId)) })
    .eq("id", assignmentId);

  if (error) return err(error.message);

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
  return okVoid();
}

// --- Notes ---


