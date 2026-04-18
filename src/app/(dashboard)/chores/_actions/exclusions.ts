"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

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
