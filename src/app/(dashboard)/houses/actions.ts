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
