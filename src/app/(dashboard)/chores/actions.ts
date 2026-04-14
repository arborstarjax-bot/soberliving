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

// --- Chore Templates ---

export async function createChore(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createChoreSchema.safeParse({
    house_id: formData.get("house_id"),
    name: formData.get("name"),
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
  const endDate = addDays(startDate, 13); // 2-week cycle

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
    description: `New 2-week chore rotation started by ${user.full_name} (${parsed.data.cycle_start_date})`,
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

  // Check if this chore is already assigned in this rotation
  const { data: existingAssignment } = await supabase
    .from("chore_rotation_assignments")
    .select("id")
    .eq("rotation_id", parsed.data.rotation_id)
    .eq("chore_id", parsed.data.chore_id)
    .single();

  if (existingAssignment) {
    // Update existing assignment
    const { error } = await supabase
      .from("chore_rotation_assignments")
      .update({
        resident_id: parsed.data.resident_id,
        assigned_by: user.id,
      })
      .eq("id", existingAssignment.id);

    if (error) return { error: error.message };
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

    // Auto-create signoff records for Mon/Wed/Fri of both weeks
    const signoffs = [];
    const startDate = new Date(rotation.cycle_start_date);

    for (let weekNum = 1; weekNum <= 2; weekNum++) {
      const weekOffset = (weekNum - 1) * 7;
      // Mon=0, Wed=2, Fri=4 offset from start of week (assuming Monday start)
      const dayOffsets = [
        { offset: 0, day: "monday" as const },
        { offset: 2, day: "wednesday" as const },
        { offset: 4, day: "friday" as const },
      ];
      for (const { offset, day } of dayOffsets) {
        const signoffDate = addDays(startDate, weekOffset + offset);
        signoffs.push({
          rotation_assignment_id: data.id,
          sign_off_date: format(signoffDate, "yyyy-MM-dd"),
          day_of_week: day,
          week_number: weekNum,
          status: "pending",
        });
      }
    }

    await supabase.from("chore_signoffs").insert(signoffs);
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

  revalidatePath("/chores");
  return {};
}

// --- Signoffs ---

export async function markSignoffComplete(signoffId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  // Look up the signoff's assignment to verify authorization
  const { data: signoff } = await supabase
    .from("chore_signoffs")
    .select("rotation_assignment_id, rotation_assignment:chore_rotation_assignments(resident_id, rotation:chore_rotations(house_id))")
    .eq("id", signoffId)
    .single();

  if (!signoff) return { error: "Signoff not found" };

  const assignment = signoff.rotation_assignment as unknown as {
    resident_id: string;
    rotation: { house_id: string } | null;
  } | null;

  const houseId = assignment?.rotation?.house_id ?? "";

  if (user.role === "resident") {
    // Residents can only complete their own signoffs
    const { data: residentRecord } = await supabase
      .from("residents")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!residentRecord || residentRecord.id !== assignment?.resident_id) {
      return { error: "Not authorized" };
    }
  } else {
    // Staff must have access to the house
    if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
      return { error: "Not authorized" };
    }
  }

  const { error } = await supabase
    .from("chore_signoffs")
    .update({
      status: "completed_pending_review",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", signoffId);

  if (error) return { error: error.message };

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
  }

  revalidatePath("/chores");
  return {};
}
