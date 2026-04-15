"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createDemeritSchema, resolveDemeritSchema } from "@/lib/validations";

// --- Demerits ---

export async function issueDemerit(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const parsed = createDemeritSchema.safeParse({
    resident_id: formData.get("resident_id"),
    house_id: formData.get("house_id"),
    points: formData.get("points") || 1,
    reason: formData.get("reason"),
    category: formData.get("category") || undefined,
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
    .from("demerits")
    .insert({ ...parsed.data, issued_by: user.id })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: parsed.data.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "demerit_issued",
    entityType: "demerit",
    entityId: data.id,
    description: `${parsed.data.points} demerit point(s) issued to ${resident?.full_name} by ${user.full_name}: ${parsed.data.reason}`,
    metadata: { points: parsed.data.points, category: parsed.data.category },
  });

  revalidatePath("/admin");
  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return {};
}

export async function resolveDemerit(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const parsed = resolveDemeritSchema.safeParse({
    demerit_id: formData.get("demerit_id"),
    resolution_note: formData.get("resolution_note") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data: demerit } = await supabase
    .from("demerits")
    .select("house_id, resident_id, resident:residents(full_name)")
    .eq("id", parsed.data.demerit_id)
    .single();

  if (!demerit) return { error: "Demerit not found" };

  if (user.role !== "admin" && !canAccessHouse(user, demerit.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("demerits")
    .update({
      status: "resolved",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      resolution_note: parsed.data.resolution_note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.demerit_id);

  if (error) return { error: error.message };

  const residentName = (demerit.resident as unknown as { full_name: string } | null)?.full_name;

  await logActivity({
    houseId: demerit.house_id,
    residentId: demerit.resident_id,
    actorId: user.id,
    eventType: "demerit_resolved",
    entityType: "demerit",
    entityId: parsed.data.demerit_id,
    description: `Demerit resolved for ${residentName} by ${user.full_name}`,
  });

  revalidatePath("/admin");
  return {};
}

// --- Payments: Mark pending payment as received ---

export async function markPaymentReceived(paymentId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, house_id, resident_id, amount, payment_type, status, resident:residents(full_name)")
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found" };
  if (payment.status !== "pending") return { error: "Payment is not pending" };

  if (user.role !== "admin" && !canAccessHouse(user, payment.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("payments")
    .update({
      status: "completed",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (error) return { error: error.message };

  const residentName = (payment.resident as unknown as { full_name: string } | null)?.full_name;

  await logActivity({
    houseId: payment.house_id,
    residentId: payment.resident_id,
    actorId: user.id,
    eventType: "payment_received",
    entityType: "payment",
    entityId: payment.id,
    description: `$${payment.amount} ${payment.payment_type} payment marked as received for ${residentName} by ${user.full_name}`,
  });

  revalidatePath("/admin");
  revalidatePath("/payments");
  return {};
}
