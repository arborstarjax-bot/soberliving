"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import {
  createChoreSchema,
  updateChoreSchema,
  createChoreTaskSchema,
  createRotationSchema,
  assignRotationChoreSchema,
} from "@/lib/validations";
import { addDays, format } from "date-fns";
import { getHouseToday, getHouseYesterday } from "@/lib/timezone";
import { sendNotification, sendNotificationToHouseManagers } from "@/lib/notifications";

// --- Chore Templates ---

export async function createChore(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createChoreSchema.safeParse({
    house_id: formData.get("house_id"),
    name: formData.get("name"),
    days_of_week: formData.getAll("days_of_week"),
    cycle_weeks: formData.get("cycle_weeks"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (user.role !== "admin" && !canAccessHouse(user, parsed.data.house_id)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // Get max sort_order for this house
  const { data: existing } = await supabase
    .from("chores")
    .select("sort_order")
    .eq("house_id", parsed.data.house_id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("chores")
    .insert({ ...parsed.data, sort_order: nextOrder })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: parsed.data.house_id,
    actorId: user.id,
    eventType: "chore_created",
    entityType: "chore",
    entityId: data.id,
    description: `Chore "${parsed.data.name}" created by ${user.full_name}`,
  });

  revalidatePath("/chores");
  return {};
}

export async function updateChore(choreId: string, formData: FormData) {
  const user = await requireAuth();
  const parsed = updateChoreSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data: chore } = await supabase
    .from("chores")
    .select("house_id")
    .eq("id", choreId)
    .single();

  if (!chore) return { error: "Chore not found" };
  if (user.role !== "admin" && !canAccessHouse(user, chore.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("chores")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", choreId);

  if (error) return { error: error.message };

  revalidatePath("/chores");
  return {};
}

export async function archiveChore(choreId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: chore } = await supabase
    .from("chores")
    .select("house_id, name")
    .eq("id", choreId)
    .single();

  if (!chore) return { error: "Chore not found" };
  if (user.role !== "admin" && !canAccessHouse(user, chore.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("chores")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", choreId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: chore.house_id,
    actorId: user.id,
    eventType: "chore_archived",
    entityType: "chore",
    entityId: choreId,
    description: `Chore "${chore.name}" archived by ${user.full_name}`,
  });

  revalidatePath("/chores");
  return {};
}

// --- Chore Tasks ---

export async function addChoreTask(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createChoreTaskSchema.safeParse({
    chore_id: formData.get("chore_id"),
    description: formData.get("description"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data: chore } = await supabase
    .from("chores")
    .select("house_id")
    .eq("id", parsed.data.chore_id)
    .single();

  if (!chore) return { error: "Chore not found" };
  if (user.role !== "admin" && !canAccessHouse(user, chore.house_id)) {
    return { error: "Not authorized" };
  }

  // Get max sort_order
  const { data: existing } = await supabase
    .from("chore_tasks")
    .select("sort_order")
    .eq("chore_id", parsed.data.chore_id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase
    .from("chore_tasks")
    .insert({ ...parsed.data, sort_order: nextOrder });

  if (error) return { error: error.message };

  revalidatePath("/chores");
  return {};
}

export async function removeChoreTask(taskId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("chore_tasks")
    .select("chore_id, chore:chores(house_id)")
    .eq("id", taskId)
    .single();

  if (!task) return { error: "Task not found" };

  const houseId = (task.chore as unknown as { house_id: string } | null)?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("chore_tasks")
    .update({ is_active: false })
    .eq("id", taskId);

  if (error) return { error: error.message };

  revalidatePath("/chores");
  return {};
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
    houseRow?.timezone ?? "America/Los_Angeles"
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
    rotateHouseRow?.timezone ?? "America/Los_Angeles"
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

  // Get exclusions for this house's chores
  const choreIds = assignments.map((a) => a.chore_id);
  const { data: exclusions } = await supabase
    .from("chore_exclusions")
    .select("chore_id, resident_id")
    .in("chore_id", choreIds);

  const exclusionSet = new Set(
    (exclusions ?? []).map((e) => `${e.chore_id}:${e.resident_id}`)
  );

  // Collect the list of resident IDs from current assignments
  const residentIds = assignments.map((a) => a.resident_id);

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

export async function markSignoffComplete(signoffId: string, photoUrl?: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  // Look up the signoff's assignment to verify authorization
  const { data: signoff } = await supabase
    .from("chore_signoffs")
    .select("id, status, sign_off_date, rotation_assignment_id, rotation_assignment:chore_rotation_assignments(resident_id, rotation:chore_rotations(house_id))")
    .eq("id", signoffId)
    .single();

  if (!signoff) return { error: "Signoff not found" };

  // Only allow marking signoffs that are still pending
  const currentStatus = (signoff as unknown as { status: string }).status;
  if (currentStatus !== "pending") {
    return { error: "This signoff has already been submitted or reviewed" };
  }

  const assignment = signoff.rotation_assignment as unknown as {
    resident_id: string;
    rotation: { house_id: string } | null;
  } | null;

  const houseId = assignment?.rotation?.house_id ?? "";

  // Look up house timezone for accurate date checks
  const supabaseForTz = await createClient();
  const { data: houseRow } = await supabaseForTz
    .from("houses")
    .select("timezone")
    .eq("id", houseId)
    .single();
  const tz = houseRow?.timezone ?? "America/Los_Angeles";
  const todayLocal = getHouseToday(tz);
  const yesterdayLocal = getHouseYesterday(tz);

  if (user.role === "resident") {
    // Residents can only complete their own signoffs
    const { data: residentRecord } = await supabase
      .from("residents")
      .select("id, force_photo")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!residentRecord || residentRecord.id !== assignment?.resident_id) {
      return { error: "Not authorized" };
    }

    // Residents can only mark today's signoff (with ±1 day grace)
    if (signoff.sign_off_date !== todayLocal && signoff.sign_off_date !== yesterdayLocal) {
      return { error: "You can only sign off on today's chore" };
    }

    // Check if force_photo is enabled
    if (residentRecord.force_photo && !photoUrl) {
      return { error: "Photo is required — please upload a photo before signing off" };
    }
  } else {
    // Staff must have access to the house
    if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
      return { error: "Not authorized" };
    }
  }

  const updateData: Record<string, unknown> = {
    status: "completed_pending_review",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (photoUrl) {
    updateData.photo_url = photoUrl;
  }

  const { error } = await supabase
    .from("chore_signoffs")
    .update(updateData)
    .eq("id", signoffId);

  if (error) return { error: error.message };

  // Notify house managers when a resident submits a signoff for review
  if (user.role === "resident" && houseId) {
    await sendNotificationToHouseManagers(houseId, {
      type: "chore_submitted",
      title: "Chore Submitted for Review",
      message: `${user.full_name} submitted a chore for review.`,
      actionUrl: "/chores",
      entityType: "chore_signoff",
      entityId: signoffId,
    });
  }

  revalidatePath("/chores");
  return {};
}

export async function reviewSignoff(
  signoffId: string,
  action: "approve" | "reject",
  rejectionNote?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  // Verify house-scoped access before mutating
  const { data: signoffData } = await supabase
    .from("chore_signoffs")
    .select("rotation_assignment:chore_rotation_assignments(rotation:chore_rotations(house_id))")
    .eq("id", signoffId)
    .single();

  if (signoffData) {
    const ra = signoffData.rotation_assignment as unknown as {
      rotation: { house_id: string } | null;
    } | null;
    const houseId = ra?.rotation?.house_id ?? "";
    if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
      return { error: "Not authorized" };
    }
  }

  const updateData: Record<string, unknown> = {
    status: action === "approve" ? "approved" : "rejected",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (action === "reject" && rejectionNote) {
    updateData.rejection_note = rejectionNote;
  }

  const { error } = await supabase
    .from("chore_signoffs")
    .update(updateData)
    .eq("id", signoffId);

  if (error) return { error: error.message };

  // Get details for activity log
  const { data: signoff } = await supabase
    .from("chore_signoffs")
    .select(
      "rotation_assignment:chore_rotation_assignments(resident_id, chore:chores(name, house_id))"
    )
    .eq("id", signoffId)
    .single();

  if (signoff?.rotation_assignment) {
    const ra = signoff.rotation_assignment as unknown as {
      resident_id: string;
      chore: { name: string; house_id: string } | null;
    };
    await logActivity({
      houseId: ra.chore?.house_id,
      residentId: ra.resident_id,
      actorId: user.id,
      eventType: action === "approve" ? "chore_approved" : "chore_rejected",
      entityType: "chore_signoff",
      entityId: signoffId,
      description: `"${ra.chore?.name}" signoff ${action}d by ${user.full_name}`,
    });

    // Notify the resident about the review result
    const { data: residentUser } = await supabase
      .from("residents")
      .select("user_id")
      .eq("id", ra.resident_id)
      .single();

    if (residentUser?.user_id) {
      await sendNotification({
        userId: residentUser.user_id,
        type: action === "approve" ? "chore_approved" : "chore_rejected",
        title: action === "approve" ? "Chore Approved" : "Chore Rejected",
        message: action === "approve"
          ? `Your "${ra.chore?.name}" chore was approved.`
          : `Your "${ra.chore?.name}" chore was rejected.${rejectionNote ? ` Reason: ${rejectionNote}` : " Please redo it."}`,
        actionUrl: "/chores",
        entityType: "chore_signoff",
        entityId: signoffId,
      });
    }
  }

  revalidatePath("/chores");
  return {};
}

// --- Staff Override Signoff Status ---

export async function overrideSignoffStatus(
  signoffId: string,
  newStatus: "pending" | "approved" | "rejected" | "missed" | "completed_pending_review",
  note?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: signoff } = await supabase
    .from("chore_signoffs")
    .select("id, status, rotation_assignment:chore_rotation_assignments(resident_id, chore:chores(name, house_id))")
    .eq("id", signoffId)
    .single();

  if (!signoff) return { error: "Signoff not found" };

  const ra = signoff.rotation_assignment as unknown as {
    resident_id: string;
    chore: { name: string; house_id: string } | null;
  } | null;

  const houseId = ra?.chore?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "rejected") {
    updateData.reviewed_by = user.id;
    updateData.reviewed_at = new Date().toISOString();
    if (note) updateData.rejection_note = note;
  }
  if (newStatus === "approved") {
    updateData.reviewed_by = user.id;
    updateData.reviewed_at = new Date().toISOString();
  }
  if (newStatus === "pending") {
    updateData.completed_at = null;
    updateData.reviewed_by = null;
    updateData.reviewed_at = null;
    updateData.rejection_note = null;
  }

  // If changing FROM missed to another status, auto-reverse the linked demerit
  const oldStatus = (signoff as unknown as { status: string }).status;

  const { error } = await supabase
    .from("chore_signoffs")
    .update(updateData)
    .eq("id", signoffId);

  if (error) return { error: error.message };

  if (oldStatus === "missed" && newStatus !== "missed") {
    // Delete any auto-generated demerit linked to this signoff
    const { data: linkedDemerits } = await supabase
      .from("demerits")
      .select("id")
      .eq("signoff_id", signoffId);

    if (linkedDemerits && linkedDemerits.length > 0) {
      for (const d of linkedDemerits) {
        await supabase.from("demerits").delete().eq("id", d.id);
      }
      await logActivity({
        houseId,
        residentId: ra?.resident_id,
        actorId: user.id,
        eventType: "demerit_auto_reversed",
        entityType: "demerit",
        entityId: signoffId,
        description: `Auto-reversed demerit for "${ra?.chore?.name}" — signoff status changed from missed to ${newStatus}`,
      });
    }
  }

  await logActivity({
    houseId,
    residentId: ra?.resident_id,
    actorId: user.id,
    eventType: "chore_signoff_overridden",
    entityType: "chore_signoff",
    entityId: signoffId,
    description: `"${ra?.chore?.name}" signoff status changed to ${newStatus} by ${user.full_name}`,
  });

  revalidatePath("/chores");
  revalidatePath("/discipline");
  return {};
}

// --- Resident Redo After Rejection ---

export async function redoSignoff(signoffId: string, photoUrl?: string) {
  const user = await requireAuth();
  if (user.role !== "resident") return { error: "Only residents can redo signoffs" };

  const supabase = await createClient();

  const { data: signoff } = await supabase
    .from("chore_signoffs")
    .select("id, status, sign_off_date, rotation_assignment_id, rotation_assignment:chore_rotation_assignments(resident_id, rotation:chore_rotations(house_id))")
    .eq("id", signoffId)
    .single();

  if (!signoff) return { error: "Signoff not found" };
  if ((signoff as unknown as { status: string }).status !== "rejected") {
    return { error: "Only rejected signoffs can be redone" };
  }

  const assignment = signoff.rotation_assignment as unknown as {
    resident_id: string;
    rotation: { house_id: string } | null;
  } | null;

  // Verify this is the resident's own signoff
  const { data: residentRecord } = await supabase
    .from("residents")
    .select("id, force_photo")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!residentRecord || residentRecord.id !== assignment?.resident_id) {
    return { error: "Not authorized" };
  }

  if (residentRecord.force_photo && !photoUrl) {
    return { error: "Photo is required — please upload a photo before signing off" };
  }

  const updateData: Record<string, unknown> = {
    status: "completed_pending_review",
    completed_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    rejection_note: null,
    updated_at: new Date().toISOString(),
  };

  if (photoUrl) {
    updateData.photo_url = photoUrl;
  }

  const { error } = await supabase
    .from("chore_signoffs")
    .update(updateData)
    .eq("id", signoffId);

  if (error) return { error: error.message };

  // Notify house managers when a resident resubmits a signoff for review
  const houseId = assignment?.rotation?.house_id ?? "";
  if (houseId) {
    await sendNotificationToHouseManagers(houseId, {
      type: "chore_submitted",
      title: "Chore Resubmitted for Review",
      message: `${user.full_name} resubmitted a chore for review after rejection.`,
      actionUrl: "/chores",
      entityType: "chore_signoff",
      entityId: signoffId,
    });
  }

  revalidatePath("/chores");
  return {};
}

// --- Chore Exclusions ---

export async function addChoreExclusion(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const choreId = formData.get("chore_id") as string;
  const residentId = formData.get("resident_id") as string;
  const reason = (formData.get("reason") as string) || null;

  if (!choreId || !residentId) return { error: "Chore and resident are required" };

  const supabase = await createClient();

  const { data: chore } = await supabase
    .from("chores")
    .select("house_id, name")
    .eq("id", choreId)
    .single();

  if (!chore) return { error: "Chore not found" };
  if (user.role !== "admin" && !canAccessHouse(user, chore.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("chore_exclusions")
    .insert({
      chore_id: choreId,
      resident_id: residentId,
      reason,
      created_by: user.id,
    });

  if (error) {
    if (error.code === "23505") return { error: "This resident is already excluded from this chore" };
    return { error: error.message };
  }

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name")
    .eq("id", residentId)
    .single();

  await logActivity({
    houseId: chore.house_id,
    residentId,
    actorId: user.id,
    eventType: "chore_exclusion_added",
    entityType: "chore_exclusion",
    entityId: choreId,
    description: `${resident?.full_name} excluded from "${chore.name}" by ${user.full_name}${reason ? ` (${reason})` : ""}`,
  });

  revalidatePath("/chores");
  return {};
}

export async function removeChoreExclusion(exclusionId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: exclusion } = await supabase
    .from("chore_exclusions")
    .select("chore_id, resident_id, chore:chores(house_id, name), resident:residents(full_name)")
    .eq("id", exclusionId)
    .single();

  if (!exclusion) return { error: "Exclusion not found" };

  const houseId = (exclusion.chore as unknown as { house_id: string; name: string })?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("chore_exclusions")
    .delete()
    .eq("id", exclusionId);

  if (error) return { error: error.message };

  const choreName = (exclusion.chore as unknown as { name: string })?.name ?? "";
  const residentName = (exclusion.resident as unknown as { full_name: string })?.full_name ?? "";

  await logActivity({
    houseId,
    residentId: exclusion.resident_id,
    actorId: user.id,
    eventType: "chore_exclusion_removed",
    entityType: "chore_exclusion",
    entityId: exclusion.chore_id,
    description: `${residentName} exclusion from "${choreName}" removed by ${user.full_name}`,
  });

  revalidatePath("/chores");
  return {};
}

// --- Chore Scheduling (day-of-week) ---

export async function updateChoreSchedule(choreId: string, scheduledDays: string[]) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: chore } = await supabase
    .from("chores")
    .select("house_id, name")
    .eq("id", choreId)
    .single();

  if (!chore) return { error: "Chore not found" };
  if (user.role !== "admin" && !canAccessHouse(user, chore.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("chores")
    .update({
      days_of_week: scheduledDays,
      updated_at: new Date().toISOString(),
    })
    .eq("id", choreId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: chore.house_id,
    actorId: user.id,
    eventType: "chore_schedule_updated",
    entityType: "chore",
    entityId: choreId,
    description: `Schedule updated for "${chore.name}" by ${user.full_name}: ${scheduledDays.join(", ") || "none"}`,
  });

  revalidatePath("/chores");
  return {};
}

/**
 * Complete a chore by choreId + residentId + date.
 * Finds the matching signoff record and delegates to markSignoffComplete.
 * Used by the resident-facing chore-completion-form.
 */
export async function completeChore(
  choreId: string,
  residentId: string,
  date: string,
  photoUrl?: string
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createClient();

  // Find the signoff for this chore assignment on this date
  const { data: signoff } = await supabase
    .from("chore_signoffs")
    .select("id, rotation_assignment:chore_rotation_assignments!inner(resident_id, rotation:chore_rotations!inner(house_id), chore_id)")
    .eq("sign_off_date", date)
    .eq("status", "pending")
    .eq("rotation_assignment.resident_id", residentId)
    .eq("rotation_assignment.chore_id", choreId)
    .maybeSingle();

  if (!signoff) {
    return { error: "No pending signoff found for this chore today" };
  }

  return markSignoffComplete(signoff.id, photoUrl);
}

export async function uploadChorePhoto(formData: FormData): Promise<{ url?: string; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const file = formData.get("file") as File;
  if (!file) return { error: "No file provided" };

  const ext = file.name.split(".").pop();
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("chore-photos")
    .upload(path, file, { upsert: false });

  if (error) return { error: error.message };

  const { data: publicUrl } = supabase.storage
    .from("chore-photos")
    .getPublicUrl(path);

  return { url: publicUrl.publicUrl };
}
