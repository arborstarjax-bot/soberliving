"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createIncidentSchema } from "@/lib/validations";

export async function createIncident(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createIncidentSchema.safeParse({
    resident_id: formData.get("resident_id"),
    house_id: formData.get("house_id"),
    severity: formData.get("severity"),
    category: formData.get("category") || undefined,
    description: formData.get("description"),
    occurred_at: formData.get("occurred_at"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (user.role !== "admin" && !canAccessHouse(user, parsed.data.house_id)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name")
    .eq("id", parsed.data.resident_id)
    .single();

  const { data, error } = await supabase
    .from("incidents")
    .insert({ ...parsed.data, reported_by: user.id })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: parsed.data.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "incident_logged",
    entityType: "incident",
    entityId: data.id,
    description: `${parsed.data.severity} incident logged for ${resident?.full_name} by ${user.full_name}`,
    metadata: { severity: parsed.data.severity, category: parsed.data.category },
  });

  revalidatePath("/incidents");
  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return {};
}
