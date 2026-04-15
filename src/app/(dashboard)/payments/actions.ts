"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createPaymentSchema, voidPaymentSchema, upsertRentConfigSchema } from "@/lib/validations";

export async function createPayment(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const parsed = createPaymentSchema.safeParse({
    resident_id: formData.get("resident_id"),
    house_id: formData.get("house_id"),
    amount: formData.get("amount"),
    payment_type: formData.get("payment_type"),
    payment_method: formData.get("payment_method") || undefined,
    status: formData.get("status") || "completed",
    period_start: formData.get("period_start") || undefined,
    period_end: formData.get("period_end") || undefined,
    due_date: formData.get("due_date") || undefined,
    paid_at: formData.get("paid_at") || undefined,
    note: formData.get("note") || undefined,
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
    .from("payments")
    .insert({
      ...parsed.data,
      recorded_by: user.id,
      paid_at: parsed.data.paid_at || new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: parsed.data.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "payment_recorded",
    entityType: "payment",
    entityId: data.id,
    description: `$${parsed.data.amount} ${parsed.data.payment_type} payment recorded for ${resident?.full_name} by ${user.full_name}`,
    metadata: {
      amount: parsed.data.amount,
      payment_type: parsed.data.payment_type,
      payment_method: parsed.data.payment_method,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return {};
}

export async function voidPayment(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const parsed = voidPaymentSchema.safeParse({
    payment_id: formData.get("payment_id"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, house_id, resident_id, amount, payment_type, status, resident:residents(full_name)")
    .eq("id", parsed.data.payment_id)
    .single();

  if (!payment) return { error: "Payment not found" };

  if (user.role !== "admin" && !canAccessHouse(user, payment.house_id)) {
    return { error: "Not authorized" };
  }

  if (payment.status === "void" || payment.status === "refunded") {
    return { error: "Payment cannot be voided" };
  }

  const { error } = await supabase
    .from("payments")
    .update({ status: "void", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.payment_id);

  if (error) return { error: error.message };

  const residentName = (payment.resident as unknown as { full_name: string } | null)?.full_name;

  await logActivity({
    houseId: payment.house_id,
    residentId: payment.resident_id,
    actorId: user.id,
    eventType: "payment_voided",
    entityType: "payment",
    entityId: payment.id,
    description: `$${payment.amount} ${payment.payment_type} payment voided for ${residentName} by ${user.full_name}`,
    metadata: { amount: payment.amount, payment_type: payment.payment_type },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath(`/residents/${payment.resident_id}`);
  return {};
}

export async function upsertRentConfig(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const parsed = upsertRentConfigSchema.safeParse({
    house_id: formData.get("house_id"),
    monthly_amount: formData.get("monthly_amount"),
    due_day_of_month: formData.get("due_day_of_month"),
    late_fee: formData.get("late_fee"),
    grace_period_days: formData.get("grace_period_days"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (user.role !== "admin" && !canAccessHouse(user, parsed.data.house_id)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // Check if a config already exists for this house
  const { data: existing } = await supabase
    .from("rent_configs")
    .select("id")
    .eq("house_id", parsed.data.house_id)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("rent_configs")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("rent_configs")
      .insert(parsed.data);
    if (error) return { error: error.message };
  }

  const { data: house } = await supabase
    .from("houses")
    .select("name")
    .eq("id", parsed.data.house_id)
    .single();

  await logActivity({
    houseId: parsed.data.house_id,
    actorId: user.id,
    eventType: "rent_config_updated",
    entityType: "rent_config",
    entityId: parsed.data.house_id,
    description: `Rent config updated for ${house?.name}: $${parsed.data.monthly_amount}/mo, due day ${parsed.data.due_day_of_month}`,
    metadata: { monthly_amount: parsed.data.monthly_amount, due_day: parsed.data.due_day_of_month },
  });

  revalidatePath("/payments");
  revalidatePath(`/houses/${parsed.data.house_id}`);
  return {};
}
