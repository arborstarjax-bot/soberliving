"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import {
  createHouseSchema,
  updateHouseSchema,
  createRoomSchema,
  updateRoomSchema,
  createBedSchema,
  updateBedSchema,
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
  const user = await requireAuth();
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }
  const parsed = updateHouseSchema.safeParse({
    name: formData.get("name") || undefined,
    address: formData.has("address") ? (formData.get("address") || null) : undefined,
    phone: formData.has("phone") ? (formData.get("phone") || null) : undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();
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
  return {};
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
    bed_count: formData.get("bed_count") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  if (user.role !== "admin" && !canAccessHouse(user, parsed.data.house_id)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();
  const { bed_count, ...roomData } = parsed.data;
  const { data, error } = await supabase
    .from("rooms")
    .insert(roomData)
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Auto-create beds if bed_count was specified
  if (bed_count && bed_count > 0) {
    const beds = Array.from({ length: bed_count }, (_, i) => ({
      room_id: data.id,
      label: `Bed ${i + 1}`,
    }));
    await supabase.from("beds").insert(beds);
    await supabase.rpc("update_house_capacity", { p_house_id: parsed.data.house_id });
  }

  await logActivity({
    houseId: parsed.data.house_id,
    actorId: user.id,
    eventType: "room_created",
    entityType: "room",
    entityId: data.id,
    description: `Room "${parsed.data.name}" created by ${user.full_name}`,
  });

  revalidatePath(`/houses/${parsed.data.house_id}`);
  revalidatePath("/admin");
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

// --- Update Room ---

export async function updateRoom(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const roomId = formData.get("room_id") as string;
  if (!roomId) return { error: "Room ID is required" };

  const parsed = updateRoomSchema.safeParse({
    name: formData.get("name") || undefined,
    floor: formData.get("floor") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
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
    .update(parsed.data)
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
  revalidatePath("/admin");
  return {};
}

// --- Delete Room ---

export async function deleteRoom(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const roomId = formData.get("room_id") as string;
  if (!roomId) return { error: "Room ID is required" };

  const supabase = await createClient();
  const { data: room } = await supabase
    .from("rooms")
    .select("house_id, name")
    .eq("id", roomId)
    .single();

  if (!room) return { error: "Room not found" };

  if (user.role !== "admin" && !canAccessHouse(user, room.house_id)) {
    return { error: "Not authorized" };
  }

  // Soft-delete by setting is_active = false
  const { error } = await supabase
    .from("rooms")
    .update({ is_active: false })
    .eq("id", roomId);

  if (error) return { error: error.message };

  // End active bed assignments for all beds in this room and soft-delete beds
  const { data: roomBeds } = await supabase
    .from("beds")
    .select("id")
    .eq("room_id", roomId);

  if (roomBeds && roomBeds.length > 0) {
    const bedIds = roomBeds.map((b) => b.id);
    await supabase
      .from("bed_assignments")
      .update({ end_date: new Date().toISOString().split("T")[0] })
      .in("bed_id", bedIds)
      .is("end_date", null);
    await supabase
      .from("beds")
      .update({ is_active: false })
      .in("id", bedIds);
  }

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
  revalidatePath("/admin");
  return {};
}

// --- Update Bed ---

export async function updateBed(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const bedId = formData.get("bed_id") as string;
  if (!bedId) return { error: "Bed ID is required" };

  const parsed = updateBedSchema.safeParse({
    label: formData.get("label"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: bed } = await supabase
    .from("beds")
    .select("room_id, label, rooms(house_id)")
    .eq("id", bedId)
    .single();

  if (!bed) return { error: "Bed not found" };
  const houseId = (bed.rooms as unknown as { house_id: string })?.house_id;

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("beds")
    .update(parsed.data)
    .eq("id", bedId);

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    actorId: user.id,
    eventType: "bed_updated",
    entityType: "bed",
    entityId: bedId,
    description: `Bed renamed from "${bed.label}" to "${parsed.data.label}" by ${user.full_name}`,
  });

  revalidatePath(`/houses/${houseId}`);
  revalidatePath("/admin");
  return {};
}

// --- Delete Bed ---

export async function deleteBed(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const bedId = formData.get("bed_id") as string;
  if (!bedId) return { error: "Bed ID is required" };

  const supabase = await createClient();
  const { data: bed } = await supabase
    .from("beds")
    .select("room_id, label, rooms(house_id)")
    .eq("id", bedId)
    .single();

  if (!bed) return { error: "Bed not found" };
  const houseId = (bed.rooms as unknown as { house_id: string })?.house_id;

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  // Soft-delete by setting is_active = false
  const { error } = await supabase
    .from("beds")
    .update({ is_active: false })
    .eq("id", bedId);

  if (error) return { error: error.message };

  // End any active bed assignment for this bed
  await supabase
    .from("bed_assignments")
    .update({ end_date: new Date().toISOString().split("T")[0] })
    .eq("bed_id", bedId)
    .is("end_date", null);

  await supabase.rpc("update_house_capacity", { p_house_id: houseId });

  await logActivity({
    houseId,
    actorId: user.id,
    eventType: "bed_deleted",
    entityType: "bed",
    entityId: bedId,
    description: `Bed "${bed.label}" deleted by ${user.full_name}`,
  });

  revalidatePath(`/houses/${houseId}`);
  revalidatePath("/admin");
  return {};
}

// --- Toggle Bed Not Available ---

export async function toggleBedEmpty(bedId: string, houseId: string) {
  const user = await requireAuth();

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // Check if bed has an active resident assignment
  const { data: activeAssignment } = await supabase
    .from("bed_assignments")
    .select("id")
    .eq("bed_id", bedId)
    .is("end_date", null)
    .maybeSingle();

  if (activeAssignment) {
    return {
      error:
        "Cannot mark bed as not available while a resident is assigned",
    };
  }

  // Check current bed label to see if it's already marked not available
  const { data: bed } = await supabase
    .from("beds")
    .select("label, room_id, rooms(house_id)")
    .eq("id", bedId)
    .single();

  if (!bed) return { error: "Bed not found" };

  // Verify the bed actually belongs to the claimed house
  const actualHouseId = (bed.rooms as unknown as { house_id: string })?.house_id;
  if (actualHouseId !== houseId) return { error: "Not authorized" };

  // Toggle: if label ends with " [Not Available]" or legacy " [Empty]",
  // remove it; otherwise add " [Not Available]". We keep the legacy suffix
  // recognised so existing rows that haven't been migrated yet still work.
  const tag = " [Not Available]";
  const legacyTag = " [Empty]";
  const isMarkedEmpty =
    bed.label.endsWith(tag) || bed.label.endsWith(legacyTag);
  const newLabel = isMarkedEmpty
    ? bed.label.endsWith(tag)
      ? bed.label.slice(0, -tag.length)
      : bed.label.slice(0, -legacyTag.length)
    : bed.label + tag;

  const { error } = await supabase
    .from("beds")
    .update({ label: newLabel })
    .eq("id", bedId);

  if (error) return { error: error.message };

  revalidatePath(`/houses/${houseId}`);
  return {};
}

// --- Reorder Rooms ---

export async function reorderRooms(houseId: string, roomIds: string[]) {
  const user = await requireAuth();

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  for (let i = 0; i < roomIds.length; i++) {
    await supabase
      .from("rooms")
      .update({ sort_order: i })
      .eq("id", roomIds[i])
      .eq("house_id", houseId);
  }

  revalidatePath(`/houses/${houseId}`);
  revalidatePath("/admin");
  return {};
}
