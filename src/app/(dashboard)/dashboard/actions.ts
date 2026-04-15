"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function setSobrietyDate(sobrietyDate: string) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  if (!sobrietyDate) return { error: "Sobriety date is required" };

  // Verify the user is a resident with a residents record
  const { data: resident } = await adminClient
    .from("residents")
    .select("id, sobriety_date")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!resident) return { error: "Resident profile not found" };

  // Only allow setting if not already set
  if (resident.sobriety_date) {
    return { error: "Sobriety date is already set and cannot be changed" };
  }

  const { error } = await adminClient
    .from("residents")
    .update({
      sobriety_date: sobrietyDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", resident.id);

  if (error) return { error: error.message };

  await logActivity({
    actorId: user.id,
    residentId: resident.id,
    eventType: "sobriety_date_set",
    entityType: "resident",
    entityId: resident.id,
    description: `${user.full_name} set their sobriety date to ${sobrietyDate}`,
  });

  revalidatePath("/dashboard");
  return {};
}
