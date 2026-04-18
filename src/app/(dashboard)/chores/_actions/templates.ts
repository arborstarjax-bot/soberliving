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
  updateChoreTaskSchema,
  setChoreRoomExclusionsSchema,
} from "@/lib/validations";

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

export async function updateChore(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const choreId = formData.get("chore_id") as string | null;
  if (!choreId) return { error: "Missing chore id" };

  const parsed = updateChoreSchema.safeParse({
    name: formData.get("name"),
    days_of_week: formData.getAll("days_of_week"),
    cycle_weeks: formData.get("cycle_weeks"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

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
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", choreId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: chore.house_id,
    actorId: user.id,
    eventType: "chore_updated",
    entityType: "chore",
    entityId: choreId,
    description: `Chore "${parsed.data.name}" updated by ${user.full_name}`,
  });

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

export async function updateChoreTask(taskId: string, description: string) {
  const user = await requireAuth();

  const parsed = updateChoreTaskSchema.safeParse({ description });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data: task } = await supabase
    .from("chore_tasks")
    .select("chore_id, chore:chores(house_id)")
    .eq("id", taskId)
    .single();

  if (!task) return { error: "Task not found" };
  const houseId =
    (task.chore as unknown as { house_id: string } | null)?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("chore_tasks")
    .update({ description: parsed.data.description })
    .eq("id", taskId);

  if (error) return { error: error.message };

  revalidatePath("/chores");
  return {};
}

// Replace the full set of room exclusions for a chore. We take a
// declarative roomIds[] because the UI is a checkbox list ("check =
// excluded"), so the simplest thing is to send the whole current set
// each save — we compute add/remove diffs here rather than expose
// individual add/remove actions.
export async function setChoreRoomExclusions(
  choreId: string,
  roomIds: string[]
) {
  const user = await requireAuth();

  const parsed = setChoreRoomExclusionsSchema.safeParse({
    chore_id: choreId,
    room_ids: roomIds,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

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

  // Validate all supplied rooms belong to the chore's house — keeps
  // RLS honest and prevents accidental cross-house exclusions.
  if (parsed.data.room_ids.length > 0) {
    const { data: validRooms } = await supabase
      .from("rooms")
      .select("id")
      .eq("house_id", chore.house_id)
      .in("id", parsed.data.room_ids);
    if ((validRooms?.length ?? 0) !== parsed.data.room_ids.length) {
      return { error: "One or more rooms don't belong to this chore's house" };
    }
  }

  const { data: existing } = await supabase
    .from("chore_room_exclusions")
    .select("id, room_id")
    .eq("chore_id", choreId);

  const existingByRoom = new Map(
    (existing ?? []).map((r) => [r.room_id as string, r.id as string])
  );
  const desired = new Set(parsed.data.room_ids);

  const toInsert = parsed.data.room_ids.filter((rid) => !existingByRoom.has(rid));
  const toDeleteIds: string[] = [];
  for (const [rid, id] of existingByRoom.entries()) {
    if (!desired.has(rid)) toDeleteIds.push(id);
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase
      .from("chore_room_exclusions")
      .insert(
        toInsert.map((rid) => ({
          chore_id: choreId,
          room_id: rid,
          created_by: user.id,
        }))
      );
    if (insErr) return { error: insErr.message };
  }

  if (toDeleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from("chore_room_exclusions")
      .delete()
      .in("id", toDeleteIds);
    if (delErr) return { error: delErr.message };
  }

  await logActivity({
    houseId: chore.house_id,
    actorId: user.id,
    eventType: "chore_room_exclusions_updated",
    entityType: "chore",
    entityId: choreId,
    description: `${user.full_name} updated room exclusions for "${chore.name}" (${parsed.data.room_ids.length} excluded)`,
  });

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

// Return the room id this resident is currently bedded in (active
// bed assignment — end_date IS NULL). Null if the resident has no
// active bed. Used to skip residents whose room is excluded from a
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

