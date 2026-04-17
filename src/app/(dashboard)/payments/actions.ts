"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import {
  createPaymentSchema,
  voidPaymentSchema,
  upsertRentConfigSchema,
} from "@/lib/validations";
import { generateReceiptPdf } from "@/lib/payments/receipt-pdf";

// Facility display name shown in the receipt header. Centralised here
// so rebranding is a one-line change. Could be lifted to an env var or
// a `facility_settings` table later — not worth the DB round trip
// right now.
const FACILITY_NAME = "Sober Living";

async function allocateReceiptNumber(): Promise<{
  number: string;
  year: number;
}> {
  const admin = createAdminClient();
  const year = new Date().getFullYear();
  const { data, error } = await admin.rpc("next_receipt_number", {
    p_year: year,
  });
  if (error || !data) {
    throw new Error(
      `Could not allocate receipt number: ${error?.message ?? "empty response"}`
    );
  }
  return { number: data as unknown as string, year };
}

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
    charge_id: formData.get("charge_id") || undefined,
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
  const admin = createAdminClient();

  // Look up the resident and house up front; both are used for the
  // PDF body and the activity log description.
  const [{ data: resident }, { data: house }] = await Promise.all([
    supabase
      .from("residents")
      .select("id, full_name, user_id")
      .eq("id", parsed.data.resident_id)
      .single(),
    supabase
      .from("houses")
      .select("id, name, address")
      .eq("id", parsed.data.house_id)
      .single(),
  ]);

  if (!resident) return { error: "Resident not found" };
  if (!house) return { error: "House not found" };

  // If a charge was selected, pull it and prefill period / due_date
  // from it so the receipt reflects which billing period this covers.
  // We only need the period fields here — the paid_amount math is
  // done server-side by apply_payment_to_charge so we no longer
  // read/write paid_amount from JS.
  type ChargeRow = {
    id: string;
    due_date: string;
    period_start: string | null;
    period_end: string | null;
  };
  let chargeRow: ChargeRow | null = null;
  if (parsed.data.charge_id) {
    const { data } = await supabase
      .from("payment_charges")
      .select("id, due_date, period_start, period_end")
      .eq("id", parsed.data.charge_id)
      .single();
    chargeRow = (data as unknown as ChargeRow | null) ?? null;
  }

  const paidAtIso =
    parsed.data.paid_at || new Date().toISOString();

  // Allocate the receipt number first. If PDF generation / upload
  // fails, we still have a valid payments row + receipt number — the
  // PDF can be regenerated and re-linked later without reissuing a
  // number.
  let receiptNumber: string | null = null;
  try {
    const alloc = await allocateReceiptNumber();
    receiptNumber = alloc.number;
  } catch (e) {
    // Allocation failure is not fatal; log and continue without a
    // receipt number. Admin can re-run generation later.
    console.error("Receipt number allocation failed", e);
  }

  const periodStart =
    parsed.data.period_start || chargeRow?.period_start || null;
  const periodEnd = parsed.data.period_end || chargeRow?.period_end || null;
  const dueDate = parsed.data.due_date || chargeRow?.due_date || null;

  const { data: inserted, error } = await admin
    .from("payments")
    .insert({
      resident_id: parsed.data.resident_id,
      house_id: parsed.data.house_id,
      amount: parsed.data.amount,
      payment_type: parsed.data.payment_type,
      payment_method: parsed.data.payment_method ?? null,
      note: parsed.data.note ?? null,
      status: "completed",
      period_start: periodStart,
      period_end: periodEnd,
      due_date: dueDate,
      paid_at: paidAtIso,
      recorded_by: user.id,
      charge_id: chargeRow?.id ?? null,
      receipt_number: receiptNumber,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Failed to record payment" };
  }

  // Update the charge atomically via RPC. Doing the read-modify-write
  // in JS let two concurrent $250 payments each read paid_amount=0 and
  // both write 250 — the charge was undercredited. The RPC does the
  // entire update in one statement so the arithmetic is performed on
  // the server under row lock.
  if (chargeRow) {
    await admin.rpc("apply_payment_to_charge", {
      p_charge_id: chargeRow.id,
      p_amount: parsed.data.amount,
      p_payment_id: inserted.id,
    });
  }

  // Generate + upload the receipt PDF. Any failure here is logged
  // but does not block the payment — staff can retry by voiding and
  // re-recording, or we can add a "Regenerate Receipt" action later.
  if (receiptNumber) {
    try {
      const pdfBytes = await generateReceiptPdf({
        receiptNumber,
        paidAt: paidAtIso,
        facilityName: FACILITY_NAME,
        houseName: house.name,
        houseAddress: house.address ?? null,
        residentName: resident.full_name,
        amount: parsed.data.amount,
        paymentType: parsed.data.payment_type,
        paymentMethod: parsed.data.payment_method ?? null,
        periodStart,
        periodEnd,
        dueDate,
        note: parsed.data.note ?? null,
        recordedByName: user.full_name,
      });

      const fileName = resident.user_id
        ? `${resident.user_id}/receipts/${receiptNumber}.pdf`
        : `receipts/${receiptNumber}.pdf`;

      const { error: uploadError } = await admin.storage
        .from("documents")
        .upload(fileName, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (!uploadError && resident.user_id) {
        const { data: docRow } = await admin
          .from("documents")
          .insert({
            user_id: resident.user_id,
            name: `Payment Receipt ${receiptNumber}`,
            document_type: "payment_receipt",
            storage_path: fileName,
            file_size: pdfBytes.byteLength,
          })
          .select("id")
          .single();

        await admin
          .from("payments")
          .update({
            receipt_storage_path: fileName,
            receipt_document_id: docRow?.id ?? null,
          })
          .eq("id", inserted.id);
      }
    } catch (e) {
      console.error("Receipt PDF generation failed", e);
    }
  }

  await logActivity({
    houseId: parsed.data.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "payment_recorded",
    entityType: "payment",
    entityId: inserted.id,
    description: `$${parsed.data.amount} ${parsed.data.payment_type} payment recorded for ${resident.full_name} by ${user.full_name}${receiptNumber ? ` (receipt ${receiptNumber})` : ""}`,
    metadata: {
      amount: parsed.data.amount,
      payment_type: parsed.data.payment_type,
      payment_method: parsed.data.payment_method,
      receipt_number: receiptNumber,
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
  // Admin-only per owner spec. Managers can record payments but only
  // admins void or refund.
  if (user.role !== "admin") return { error: "Not authorized" };

  const parsed = voidPaymentSchema.safeParse({
    payment_id: formData.get("payment_id"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: payment } = await supabase
    .from("payments")
    .select(
      "id, house_id, resident_id, amount, payment_type, status, charge_id, resident:residents(full_name)"
    )
    .eq("id", parsed.data.payment_id)
    .single();

  if (!payment) return { error: "Payment not found" };

  if (payment.status === "void" || payment.status === "refunded") {
    return { error: "Payment cannot be voided" };
  }

  const { error } = await admin
    .from("payments")
    .update({ status: "void", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.payment_id);

  if (error) return { error: error.message };

  // If this payment was applied to a charge, unwind the application
  // atomically. The RPC does a single UPDATE that subtracts the
  // amount, re-derives status, and nulls out payment_id under row
  // lock, so two concurrent voids against different payments on the
  // same charge can't clobber each other.
  if (payment.charge_id) {
    await admin.rpc("reverse_payment_from_charge", {
      p_charge_id: payment.charge_id,
      p_amount: payment.amount,
    });
  }

  const residentName = (
    payment.resident as unknown as { full_name: string } | null
  )?.full_name;

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
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (user.role !== "admin" && !canAccessHouse(user, parsed.data.house_id)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // Insert first, then deactivate the previous rows. This keeps the
  // house from being left with zero active configs if the insert fails
  // (e.g. unique constraint, network blip) — the old config stays in
  // place and the user sees a real error instead of a silently broken
  // rent schedule.
  const { data: inserted, error: insertError } = await supabase
    .from("rent_configs")
    .insert({
      house_id: parsed.data.house_id,
      monthly_amount: parsed.data.monthly_amount,
      due_day_of_month: parsed.data.due_day_of_month,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  await supabase
    .from("rent_configs")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("house_id", parsed.data.house_id)
    .eq("is_active", true)
    .neq("id", inserted.id);

  // Rent config changes are financially significant — keep the
  // audit trail entry so we can see who changed the rent schedule
  // and when from the Activity feed.
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
    description: `Rent config updated for ${house?.name ?? "house"}: $${parsed.data.monthly_amount}/mo, due day ${parsed.data.due_day_of_month}`,
    metadata: {
      monthly_amount: parsed.data.monthly_amount,
      due_day: parsed.data.due_day_of_month,
    },
  });

  revalidatePath("/payments");
  revalidatePath(`/houses/${parsed.data.house_id}`);
  return {};
}
