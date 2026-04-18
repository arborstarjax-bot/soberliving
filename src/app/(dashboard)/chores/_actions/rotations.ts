"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import {
  createRotationSchema,
  assignRotationChoreSchema,
} from "@/lib/validations";
import { addDays, format } from "date-fns";
import { getHouseToday, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { sendNotification } from "@/lib/notifications";

async function getResidentCurrentRoomId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  residentId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("bed_assignments")
    .select("bed:beds(room_id)")
    .eq("resident_id", residentId)
    .is("end_date", null)
    .maybeSingle();
  const bed = data?.bed as unknown as { room_id: string } | null;
  return bed?.room_id ?? null;
}

// --- Rotations ---

export async function createRotation(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createRotationSchema.safeParse({
    house_id: formData.get("house_id"),
    cycle_start_date: formData.get("cycle_start_date"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (user.role !== "admin" && !canAccessHouse(user, parsed.data.house_id)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // Mark any existing current rotation as not current
  await supabase
    .from("chore_rotations")
    .update({ is_current: false })
    .eq("house_id", parsed.data.house_id)
    .eq("is_current", true);

  const startDate = new Date(parsed.data.cycle_start_date);

  // Determine cycle length from the max cycle_weeks of active chores in this house
  const { data: houseChores } = await supabase
    .from("chores")
    .select("cycle_weeks")
    .eq("house_id", parsed.data.house_id)
    .eq("is_active", true);

  const maxCycleWeeks = houseChores && houseChores.length > 0
    ? Math.max(...houseChores.map((c) => c.cycle_weeks ?? 2))
    : 2;

  const endDate = addDays(startDate, maxCycleWeeks * 7 - 1);

  const { data, error } = await supabase
    .from("chore_rotations")
    .insert({
      house_id: parsed.data.house_id,
      cycle_start_date: parsed.data.cycle_start_date,
      cycle_end_date: format(endDate, "yyyy-MM-dd"),
      is_current: true,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: parsed.data.house_id,
    actorId: user.id,
    eventType: "rotation_created",
    entityType: "chore_rotation",
    entityId: data.id,
    description: `New ${maxCycleWeeks}-week chore rotation started by ${user.full_name} (${parsed.data.cycle_start_date})`,
  });

  revalidatePath("/chores");
  return {};
}

// --- Rotation Assignments ---

export async function assignRotationChore(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = assignRotationChoreSchema.safeParse({
    rotation_id: formData.get("rotation_id"),
    chore_id: formData.get("chore_id"),
    resident_id: formData.get("resident_id"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // Get rotation to check house access
  const { data: rotation } = await supabase
    .from("chore_rotations")
    .select("house_id, cycle_start_date, cycle_end_date")
    .eq("id", parsed.data.rotation_id)
    .single();

  if (!rotation) return { error: "Rotation not found" };
  if (user.role !== "admin" && !canAccessHouse(user, rotation.house_id)) {
    return { error: "Not authorized" };
  }

  // Guard: refuse to assign a chore to a resident whose current room
  // is excluded from that chore. User-facing error so managers see
  // why the assign dropdown "won't stick".
  const { data: roomExclusions } = await supabase
    .from("chore_room_exclusions")
    .select("room_id")
    .eq("chore_id", parsed.data.chore_id);
  const excludedRoomIds = new Set(
    (roomExclusions ?? []).map((r) => r.room_id as string)
  );
  if (excludedRoomIds.size > 0) {
    const roomId = await getResidentCurrentRoomId(supabase, parsed.data.resident_id);
    if (roomId && excludedRoomIds.has(roomId)) {
      return {
        error:
          "This resident's room is excluded from this chore. Uncheck the room in the chore's Edit dialog to allow assignment.",
      };
    }
  }

  // Look up the house's timezone so we only create signoffs for days that
  // haven't already passed. Without this, assigning a resident mid-cycle
  // creates `pending` signoffs for past dates which the auto-enforce job
  // (generateMissedChoreDemerits) then flips to `missed` + auto-demerits
  // — penalizing the new assignee for days they weren't on the rotation.
  const { data: houseRow } = await supabase
    .from("houses")
    .select("timezone")
    .eq("id", rotation.house_id)
    .single();
  const todayStr = getHouseToday(
    houseRow?.timezone ?? DEFAULT_TIMEZONE
  );

  // Check if this chore is already assigned in this rotation
  const { data: existingAssignment } = await supabase
    .from("chore_rotation_assignments")
    .select("id")
    .eq("rotation_id", parsed.data.rotation_id)
    .eq("chore_id", parsed.data.chore_id)
    .single();

  if (existingAssignment) {
    // Clean up stale signoffs from the previous resident before reassigning
    await supabase
      .from("chore_signoffs")
      .delete()
      .eq("rotation_assignment_id", existingAssignment.id);

    // Update existing assignment
    const { error } = await supabase
      .from("chore_rotation_assignments")
      .update({
        resident_id: parsed.data.resident_id,
        assigned_by: user.id,
      })
      .eq("id", existingAssignment.id);

    if (error) return { error: error.message };

    // Re-create signoff records for the new resident
    const { data: choreData } = await supabase
      .from("chores")
      .select("days_of_week, cycle_weeks")
      .eq("id", parsed.data.chore_id)
      .single();

    const choreDays: string[] = choreData?.days_of_week ?? ["monday", "wednesday", "friday"];
    const choreCycleWeeks: number = choreData?.cycle_weeks ?? 2;

    const dayToOffset: Record<string, number> = {
      monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
      friday: 4, saturday: 5, sunday: 6,
    };

    const signoffs = [];
    const startDate = new Date(rotation.cycle_start_date);
    for (let weekNum = 1; weekNum <= choreCycleWeeks; weekNum++) {
      const weekOffset = (weekNum - 1) * 7;
      for (const day of choreDays) {
        const offset = dayToOffset[day];
        if (offset === undefined) continue;
        const signoffDate = addDays(startDate, weekOffset + offset);
        const signoffDateStr = format(signoffDate, "yyyy-MM-dd");
        // Skip past days (see comment near rotation fetch above).
        if (signoffDateStr < todayStr) continue;
        signoffs.push({
          rotation_assignment_id: existingAssignment.id,
          sign_off_date: signoffDateStr,
          day_of_week: day,
          week_number: weekNum,
          status: "pending",
        });
      }
    }

    if (signoffs.length > 0) {
      await supabase.from("chore_signoffs").insert(signoffs);
    }
  } else {
    // Create new assignment
    const { data, error } = await supabase
      .from("chore_rotation_assignments")
      .insert({
        ...parsed.data,
        assigned_by: user.id,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };

    // Look up the chore's schedule settings
    const { data: choreData } = await supabase
      .from("chores")
      .select("days_of_week, cycle_weeks")
      .eq("id", parsed.data.chore_id)
      .single();

    const choreDays: string[] = choreData?.days_of_week ?? ["monday", "wednesday", "friday"];
    const choreCycleWeeks: number = choreData?.cycle_weeks ?? 2;

    // Map day names to offset from Monday (cycle start)
    const dayToOffset: Record<string, number> = {
      monday: 0,
      tuesday: 1,
      wednesday: 2,
      thursday: 3,
      friday: 4,
      saturday: 5,
      sunday: 6,
    };

    // Auto-create signoff records based on chore's schedule
    const signoffs = [];
    const startDate = new Date(rotation.cycle_start_date);

    for (let weekNum = 1; weekNum <= choreCycleWeeks; weekNum++) {
      const weekOffset = (weekNum - 1) * 7;
      for (const day of choreDays) {
        const offset = dayToOffset[day];
        if (offset === undefined) continue;
        const signoffDate = addDays(startDate, weekOffset + offset);
        const signoffDateStr = format(signoffDate, "yyyy-MM-dd");
        // Skip past days when assigning mid-cycle (see comment near rotation
        // fetch above).
        if (signoffDateStr < todayStr) continue;
        signoffs.push({
          rotation_assignment_id: data.id,
          sign_off_date: signoffDateStr,
          day_of_week: day,
          week_number: weekNum,
          status: "pending",
        });
      }
    }

    if (signoffs.length > 0) {
      await supabase.from("chore_signoffs").insert(signoffs);
    }
  }

  const { data: chore } = await supabase
    .from("chores")
    .select("name")
    .eq("id", parsed.data.chore_id)
    .single();

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name")
    .eq("id", parsed.data.resident_id)
    .single();

  await logActivity({
    houseId: rotation.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "chore_assigned",
    entityType: "chore_rotation_assignment",
    entityId: parsed.data.rotation_id,
    description: `"${chore?.name}" assigned to ${resident?.full_name} by ${user.full_name} for rotation starting ${rotation.cycle_start_date}`,
  });

  // Notify the assigned resident so they know a chore was added to their
  // rotation (prevents "I didn't know I was on this chore" missed-demerit
  // frustration).
  const { data: residentUser } = await supabase
    .from("residents")
    .select("user_id")
    .eq("id", parsed.data.resident_id)
    .single();

  if (residentUser?.user_id) {
    await sendNotification({
      userId: residentUser.user_id,
      type: "chore_assigned",
      title: "Chore Assigned",
      message: `You were assigned "${chore?.name ?? "a chore"}" for the rotation starting ${rotation.cycle_start_date}.`,
      actionUrl: "/chores",
      entityType: "chore_rotation_assignment",
      entityId: parsed.data.rotation_id,
    });
  }

  revalidatePath("/chores");
  return {};
}

// --- Unassign ---

export async function unassignRotationChore(assignmentId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("chore_rotation_assignments")
    .select("id, chore_id, resident_id, rotation:chore_rotations(house_id), chore:chores(name), resident:residents(full_name)")
    .eq("id", assignmentId)
    .single();

  if (!assignment) return { error: "Assignment not found" };

  const houseId = (assignment.rotation as unknown as { house_id: string })?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  // Delete signoffs first (FK constraint)
  await supabase
    .from("chore_signoffs")
    .delete()
    .eq("rotation_assignment_id", assignmentId);

  // Delete the assignment
  const { error } = await supabase
    .from("chore_rotation_assignments")
    .delete()
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  const choreName = (assignment.chore as unknown as { name: string })?.name ?? "";
  const residentName = (assignment.resident as unknown as { full_name: string })?.full_name ?? "";

  await logActivity({
    houseId,
    residentId: assignment.resident_id,
    actorId: user.id,
    eventType: "chore_unassigned",
    entityType: "chore_rotation_assignment",
    entityId: assignmentId,
    description: `"${choreName}" unassigned from ${residentName} by ${user.full_name}`,
  });

  revalidatePath("/chores");
  return {};
}

// --- Rotate Schedule ---

export async function rotateSchedule(rotationId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: rotation } = await supabase
    .from("chore_rotations")
    .select("id, house_id, cycle_start_date, cycle_end_date")
    .eq("id", rotationId)
    .single();

  if (!rotation) return { error: "Rotation not found" };
  if (user.role !== "admin" && !canAccessHouse(user, rotation.house_id)) {
    return { error: "Not authorized" };
  }

  // Same mid-cycle guard as assignRotationChore: only create signoffs
  // for today and forward, so reshuffling part-way through a cycle
  // doesn't back-fill past dates that the auto-enforce job would then
  // flip to `missed` + auto-demerit.
  const { data: rotateHouseRow } = await supabase
    .from("houses")
    .select("timezone")
    .eq("id", rotation.house_id)
    .single();
  const rotateTodayStr = getHouseToday(
    rotateHouseRow?.timezone ?? DEFAULT_TIMEZONE
  );

  // Get current assignments with their chore and resident info
  const { data: assignments } = await supabase
    .from("chore_rotation_assignments")
    .select("id, chore_id, resident_id, chore:chores(id, name, days_of_week, cycle_weeks)")
    .eq("rotation_id", rotationId)
    .order("created_at");

  if (!assignments || assignments.length < 2) {
    return { error: "Need at least 2 assigned chores to rotate" };
  }

  // Get resident-level exclusions for this house's chores
  const choreIds = assignments.map((a) => a.chore_id);
  const { data: exclusions } = await supabase
    .from("chore_exclusions")
    .select("chore_id, resident_id")
    .in("chore_id", choreIds);

  const exclusionSet = new Set(
    (exclusions ?? []).map((e) => `${e.chore_id}:${e.resident_id}`)
  );

  // Also collect room-level exclusions. Any resident currently bedded
  // in an excluded room is treated the same as a resident-level
  // exclusion for that chore.
  const { data: roomExclusions } = await supabase
    .from("chore_room_exclusions")
    .select("chore_id, room_id")
    .in("chore_id", choreIds);

  // Map resident_id -> current room_id for every resident in this rotation.
  const residentIds = assignments.map((a) => a.resident_id);
  const residentRoomMap = new Map<string, string>();
  if (residentIds.length > 0) {
    const { data: beds } = await supabase
      .from("bed_assignments")
      .select("resident_id, bed:beds(room_id)")
      .in("resident_id", residentIds)
      .is("end_date", null);
    for (const row of beds ?? []) {
      const bed = row.bed as unknown as { room_id: string } | null;
      if (bed?.room_id) {
        residentRoomMap.set(row.resident_id as string, bed.room_id);
      }
    }
  }

  // Derive per-chore excluded resident set (from room exclusions) and
  // merge with the resident-level exclusionSet.
  for (const rx of roomExclusions ?? []) {
    for (const [residentId, roomId] of residentRoomMap.entries()) {
      if (roomId === rx.room_id) {
        exclusionSet.add(`${rx.chore_id}:${residentId}`);
      }
    }
  }

  // Rotate residents: shift by one position (round-robin)
  const rotatedResidents = [...residentIds.slice(1), residentIds[0]];

  // Check for exclusion conflicts and skip excluded residents
  const finalResidents = [...rotatedResidents];
  for (let i = 0; i < assignments.length; i++) {
    const choreId = assignments[i].chore_id;
    if (exclusionSet.has(`${choreId}:${finalResidents[i]}`)) {
      // Find the next non-excluded resident
      let swapped = false;
      for (let j = i + 1; j < finalResidents.length; j++) {
        if (
          !exclusionSet.has(`${choreId}:${finalResidents[j]}`) &&
          !exclusionSet.has(`${assignments[j].chore_id}:${finalResidents[i]}`)
        ) {
          [finalResidents[i], finalResidents[j]] = [finalResidents[j], finalResidents[i]];
          swapped = true;
          break;
        }
      }
      if (!swapped) {
        // If can't swap, keep original assignment for this chore
        finalResidents[i] = residentIds[i];
      }
    }
  }

  // Update each assignment with new resident and recreate signoffs
  for (let i = 0; i < assignments.length; i++) {
    const assignment = assignments[i];
    const newResidentId = finalResidents[i];

    // Update the assignment
    await supabase
      .from("chore_rotation_assignments")
      .update({ resident_id: newResidentId, assigned_by: user.id })
      .eq("id", assignment.id);

    // Delete old signoffs
    await supabase
      .from("chore_signoffs")
      .delete()
      .eq("rotation_assignment_id", assignment.id);

    // Recreate signoffs for new assignment
    const choreData = assignment.chore as unknown as {
      days_of_week?: string[];
      cycle_weeks?: number;
    } | null;
    const choreDays: string[] = choreData?.days_of_week ?? ["monday", "wednesday", "friday"];
    const choreCycleWeeks: number = choreData?.cycle_weeks ?? 2;

    const dayToOffset: Record<string, number> = {
      monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
      friday: 4, saturday: 5, sunday: 6,
    };

    const signoffs = [];
    const startDate = new Date(rotation.cycle_start_date);

    for (let weekNum = 1; weekNum <= choreCycleWeeks; weekNum++) {
      const weekOffset = (weekNum - 1) * 7;
      for (const day of choreDays) {
        const offset = dayToOffset[day];
        if (offset === undefined) continue;
        const signoffDate = addDays(startDate, weekOffset + offset);
        const signoffDateStr = format(signoffDate, "yyyy-MM-dd");
        // Skip past days (see rotateTodayStr comment near rotation fetch).
        if (signoffDateStr < rotateTodayStr) continue;
        signoffs.push({
          rotation_assignment_id: assignment.id,
          sign_off_date: signoffDateStr,
          day_of_week: day,
          week_number: weekNum,
          status: "pending",
        });
      }
    }

    if (signoffs.length > 0) {
      await supabase.from("chore_signoffs").insert(signoffs);
    }
  }

  await logActivity({
    houseId: rotation.house_id,
    actorId: user.id,
    eventType: "rotation_shuffled",
    entityType: "chore_rotation",
    entityId: rotationId,
    description: `Chore rotation shuffled by ${user.full_name}`,
  });

  revalidatePath("/chores");
  return {};
}

// --- Signoffs ---
