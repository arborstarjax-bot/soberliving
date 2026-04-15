"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import {
  createHouseSchema,
  updateHouseSchema,
  createRoomSchema,
  updateRoomSchema,
  createBedSchema,
} from "@/lib/validations";

// --- Houses ---

export async function createHouse(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole("admin");
  const parsed = createHouseSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("houses")
    .insert({ ...parsed.data, capacity: 0 })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: data.id,
    actorId: user.id,
    eventType: "house_created",
    entityType: "house",
    entityId: data.id,
    description: `House "${parsed.data.name}" created by ${user.full_name}`,
  });

  revalidatePath("/houses");
  redirect(`/houses/${data.id}`);
}

export async function updateHouse(houseId: string, formData: FormData) {
  const user = await requireRole("admin");
  const parsed = updateHouseSchema.safeParse({
    name: formData.get("name") || undefined,
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("houses")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", houseId);

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    actorId: user.id,
    eventType: "house_updated",
    entityType: "house",
    entityId: houseId,
    description: `House updated by ${user.full_name}`,
  });

  revalidatePath(`/houses/${houseId}`);
  revalidatePath("/houses");
}

export async function archiveHouse(houseId: string) {
  const user = await requireRole("admin");
  const supabase = await createClient();

  const { error } = await supabase
    .from("houses")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", houseId);

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    actorId: user.id,
    eventType: "house_archived",
    entityType: "house",
    entityId: houseId,
    description: `House archived by ${user.full_name}`,
  });

  revalidatePath("/houses");
  redirect("/houses");
}

// --- Rooms ---

export async function createRoom(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createRoomSchema.safeParse({
    house_id: formData.get("house_id"),
    name: formData.get("name"),
    floor: formData.get("floor") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  if (user.role !== "admin" && !canAccessHouse(user, parsed.data.house_id)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: parsed.data.house_id,
    actorId: user.id,
    eventType: "room_created",
    entityType: "room",
    entityId: data.id,
    description: `Room "${parsed.data.name}" created by ${user.full_name}`,
  });

  revalidatePath(`/houses/${parsed.data.house_id}`);
  return {};
}

export async function updateRoom(roomId: string, formData: FormData) {
  const user = await requireAuth();
  const parsed = updateRoomSchema.safeParse({
    name: formData.get("name") || undefined,
    floor: formData.get("floor") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // Get room to check house access
  const { data: room } = await supabase
    .from("rooms")
    .select("house_id, name")
    .eq("id", roomId)
    .single();

  if (!room) return { error: "Room not found" };

  if (user.role !== "admin" && !canAccessHouse(user, room.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("rooms")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", roomId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: room.house_id,
    actorId: user.id,
    eventType: "room_updated",
    entityType: "room",
    entityId: roomId,
    description: `Room "${parsed.data.name ?? room.name}" updated by ${user.full_name}`,
  });

  revalidatePath(`/houses/${room.house_id}`);
  return {};
}

export async function deleteRoom(roomId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  // Get room to check house access and check for occupied beds
  const { data: room } = await supabase
    .from("rooms")
    .select("house_id, name, beds(id, bed_assignments(id, end_date))")
    .eq("id", roomId)
    .single();

  if (!room) return { error: "Room not found" };

  if (user.role !== "admin" && !canAccessHouse(user, room.house_id)) {
    return { error: "Not authorized" };
  }

  // Check for active bed assignments
  const hasActiveAssignments = (room.beds ?? []).some((bed: { bed_assignments: { end_date: string | null }[] }) =>
    (bed.bed_assignments ?? []).some((ba: { end_date: string | null }) => !ba.end_date)
  );

  if (hasActiveAssignments) {
    return { error: "Cannot delete room with occupied beds. Unassign all residents first." };
  }

  // Delete beds first, then the room
  const bedIds = (room.beds ?? []).map((b: { id: string }) => b.id);
  if (bedIds.length > 0) {
    await supabase.from("beds").delete().in("id", bedIds);
  }

  const { error } = await supabase.from("rooms").delete().eq("id", roomId);

  if (error) return { error: error.message };

  // Update house capacity
  await supabase.rpc("update_house_capacity", { p_house_id: room.house_id });

  await logActivity({
    houseId: room.house_id,
    actorId: user.id,
    eventType: "room_deleted",
    entityType: "room",
    entityId: roomId,
    description: `Room "${room.name}" deleted by ${user.full_name}`,
  });

  revalidatePath(`/houses/${room.house_id}`);
  return {};
}

// --- Beds ---

export async function createBed(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createBedSchema.safeParse({
    room_id: formData.get("room_id"),
    label: formData.get("label"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // Get room to check house access
  const { data: room } = await supabase
    .from("rooms")
    .select("house_id")
    .eq("id", parsed.data.room_id)
    .single();

  if (!room) return { error: "Room not found" };

  if (user.role !== "admin" && !canAccessHouse(user, room.house_id)) {
    return { error: "Not authorized" };
  }

  const { data, error } = await supabase
    .from("beds")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Update house capacity
  await supabase.rpc("update_house_capacity", { p_house_id: room.house_id });

  await logActivity({
    houseId: room.house_id,
    actorId: user.id,
    eventType: "bed_created",
    entityType: "bed",
    entityId: data.id,
    description: `Bed "${parsed.data.label}" created by ${user.full_name}`,
  });

  revalidatePath(`/houses/${room.house_id}`);
  return {};
}
