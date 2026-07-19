"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const addSupplySchema = z.object({
  houseId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(200),
});

export async function addSupplyItem(formData: FormData) {
  const parsed = addSupplySchema.safeParse({
    houseId: formData.get("houseId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { houseId, name } = parsed.data;

  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("supply_items").insert({
    house_id: houseId,
    name,
    is_in_stock: true,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  await logActivity({
    houseId,
    actorId: user.id,
    eventType: "supply_added",
    entityType: "supply_item",
    entityId: houseId,
    description: `${user.full_name} added supply item "${name}"`,
  });

  revalidatePath(`/houses/${houseId}`);
  return {};
}

export async function toggleSupplyStock(itemId: string) {
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("supply_items")
    .select("id, house_id, name, is_in_stock")
    .eq("id", itemId)
    .single();

  if (!item) return { error: "Item not found" };
  if (user.role !== "admin" && !canAccessHouse(user, item.house_id)) {
    return { error: "Not authorized" };
  }

  const next = !item.is_in_stock;
  const { error } = await supabase
    .from("supply_items")
    .update({ is_in_stock: next, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) return { error: error.message };

  await logActivity({
    houseId: item.house_id,
    actorId: user.id,
    eventType: next ? "supply_restocked" : "supply_out_of_stock",
    entityType: "supply_item",
    entityId: itemId,
    description: `${user.full_name} marked "${item.name}" ${
      next ? "in stock" : "out of stock"
    }`,
  });

  revalidatePath(`/houses/${item.house_id}`);
  return {};
}

export async function deleteSupplyItem(itemId: string) {
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("supply_items")
    .select("id, house_id, name")
    .eq("id", itemId)
    .single();

  if (!item) return { error: "Item not found" };
  if (user.role !== "admin" && !canAccessHouse(user, item.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase.from("supply_items").delete().eq("id", itemId);
  if (error) return { error: error.message };

  await logActivity({
    houseId: item.house_id,
    actorId: user.id,
    eventType: "supply_deleted",
    entityType: "supply_item",
    entityId: itemId,
    description: `${user.full_name} deleted supply item "${item.name}"`,
  });

  revalidatePath(`/houses/${item.house_id}`);
  return {};
}
