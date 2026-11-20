"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import {
  createPaymentSchema,
  voidPaymentSchema,
  deletePaymentSchema,
  adjustChargeAmountSchema,
  addOneTimeChargeSchema,
  writeOffChargeSchema,
} from "@/lib/validations";
import { generateReceiptPdf } from "@/lib/payments/receipt-pdf";
import {
  materializeNextRentCharge,
  openRentChargesForCommitment,
} from "@/lib/payments/charges";
import { sendNotification } from "@/lib/notifications";
import { getWorkspace } from "@/lib/workspace";

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

  const ws = user.workspace_id ? await getWorkspace(user.workspace_id) : null;
  const facilityName = ws?.name ?? "Sober Living";

  const parsed = createPaymentSchema.safeParse({
    resident_id: formData.get("resident_id"),
    house_id: formData.get("house_id"),
    amount: formData.get("amount"),
    payment_type: formData.get("payment_type"),
    payment_method: formData.get("payment_method") || undefined,
    charge_id: formData.get("charge_id") || undefined,
    commitment_id: formData.get("commitment_id") || undefined,
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
  let chargeIdForPayment: string | null = parsed.data.charge_id ?? null;

  // "Pay Upcoming Rent" path — caller passed a commitment_id with no
  // charge_id. Materialize the next rent cycle on the fly, then apply
  // the payment to it. This keeps the opener's single-cycle guarantee
  // (no pre-opening months of future rows) while still letting staff
  // collect rent early.
  if (!chargeIdForPayment && parsed.data.commitment_id) {
    const next = await materializeNextRentCharge(parsed.data.commitment_id);
    if (!next) {
      return { error: "No active commitment found for upcoming rent" };
    }
    chargeIdForPayment = next.id;
  }

  if (chargeIdForPayment) {
    const { data } = await supabase
      .from("payment_charges")
      .select("id, due_date, period_start, period_end")
      .eq("id", chargeIdForPayment)
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
  //
  // Two gating concerns:
  //   1. If the resident has no user_id (admin-created profile that
  //      hasn't completed signup), we skip the upload entirely — the
  //      documents table requires user_id, and an upload with no doc
  //      row would just orphan a blob in storage.
  //   2. receipt_storage_path on the payment row must be written
  //      whenever the upload succeeded, independent of whether we were
  //      able to insert a documents row. Otherwise the Download
  //      Receipt button never renders even though the PDF is in
  //      storage.
  if (receiptNumber && resident.user_id) {
    try {
      const pdfBytes = await generateReceiptPdf({
        receiptNumber,
        paidAt: paidAtIso,
        facilityName: facilityName,
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

      const fileName = `${resident.user_id}/receipts/${receiptNumber}.pdf`;

      const { error: uploadError } = await admin.storage
        .from("documents")
        .upload(fileName, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (!uploadError) {
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
  _prevState: { error?: string } | null | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  // Admin-only per owner spec. Managers can record payments but only
  // admins void or refund.
  if (user.role !== "admin") return { error: "Not authorized" };

  const parsed = voidPaymentSchema.safeParse({
    payment_id: formData.get("payment_id"),
    reason: formData.get("reason"),
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

  const residentRel = Array.isArray(payment.resident)
    ? payment.resident[0]
    : payment.resident;
  const residentName = (residentRel as { full_name?: string } | null)?.full_name;

  await logActivity({
    houseId: payment.house_id,
    residentId: payment.resident_id,
    actorId: user.id,
    eventType: "payment_voided",
    entityType: "payment",
    entityId: payment.id,
    description: `$${payment.amount} ${payment.payment_type} payment voided for ${residentName} by ${user.full_name} — ${parsed.data.reason}`,
    metadata: {
      amount: payment.amount,
      payment_type: payment.payment_type,
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath(`/residents/${payment.resident_id}`);
  return {};
}

export async function deletePayment(
  _prevState: { error?: string } | null | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  // Admin-only — delete is more destructive than void because it
  // removes the audit row. Managers can record and void but not wipe.
  if (user.role !== "admin") return { error: "Not authorized" };

  const parsed = deletePaymentSchema.safeParse({
    payment_id: formData.get("payment_id"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: payment } = await supabase
    .from("payments")
    .select(
      "id, house_id, resident_id, amount, payment_type, status, charge_id, receipt_storage_path, receipt_document_id, receipt_number, resident:residents(full_name)"
    )
    .eq("id", parsed.data.payment_id)
    .single();

  if (!payment) return { error: "Payment not found" };

  // If the payment was applied to a charge, reverse the application
  // first (same atomic RPC the void path uses) so the charge's
  // paid_amount / status rolls back before we wipe the payment row.
  // If the payment is already void, the charge was already reversed
  // at void time, so skip to avoid double-reversing.
  if (payment.charge_id && payment.status !== "void") {
    await admin.rpc("reverse_payment_from_charge", {
      p_charge_id: payment.charge_id,
      p_amount: payment.amount,
    });
  }

  // Best-effort cleanup of the receipt PDF. We don't fail the delete
  // if storage is out of sync — the docs row and storage blob can be
  // orphaned without breaking anything, but letting the admin retry
  // removes the row on the second click.
  if (payment.receipt_storage_path) {
    await admin.storage
      .from("documents")
      .remove([payment.receipt_storage_path as string]);
  }
  if (payment.receipt_document_id) {
    await admin
      .from("documents")
      .delete()
      .eq("id", payment.receipt_document_id as string);
  }

  const { error } = await admin
    .from("payments")
    .delete()
    .eq("id", parsed.data.payment_id);
  if (error) return { error: error.message };

  const residentRel = Array.isArray(payment.resident)
    ? payment.resident[0]
    : payment.resident;
  const residentName = (residentRel as { full_name?: string } | null)?.full_name;

  await logActivity({
    houseId: payment.house_id,
    residentId: payment.resident_id,
    actorId: user.id,
    eventType: "payment_deleted",
    entityType: "payment",
    entityId: payment.id,
    description: `$${payment.amount} ${payment.payment_type} payment deleted for ${residentName} by ${user.full_name}${payment.receipt_number ? ` (receipt ${payment.receipt_number})` : ""}`,
    metadata: {
      amount: payment.amount,
      payment_type: payment.payment_type,
      receipt_number: payment.receipt_number,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath(`/residents/${payment.resident_id}`);
  return {};
}

// ──────────────────────────────────────────────────────────
// Commitment amendments
//
// Editing payment terms drafts a new house_commitments row linked to
// the resident's currently active commitment. The resident signs it
// through the normal `/sign-commitment` flow; on sign we mark the
// parent 'superseded' and open fresh charges from the effective
// date forward.
// ──────────────────────────────────────────────────────────

export async function proposeAmendment(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireAuth();
  if (user.role !== "admin") {
    return { error: "Only admins can propose amendments" };
  }

  const userId = String(formData.get("user_id") ?? "");
  const newRent = Number(formData.get("rent_amount"));
  const effectiveDate = String(formData.get("effective_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const rawFrequency = String(formData.get("payment_frequency") ?? "");
  const newFrequency: "weekly" | "monthly" | null =
    rawFrequency === "weekly" || rawFrequency === "monthly"
      ? rawFrequency
      : null;
  // Optional full-agreement fields sent by the Edit Commitment
  // Agreement dialog. Older callers (tests, direct FormData fixtures)
  // can omit these; `proposeAmendment` falls back to the parent
  // commitment's values so the amendment is still a complete row.
  const rawAdminFee = formData.get("admin_fee");
  const hasAdminFee = rawAdminFee !== null && String(rawAdminFee).trim() !== "";
  const newAdminFee = hasAdminFee ? Number(rawAdminFee) : null;
  const adminFeePaidPrior =
    formData.get("admin_fee_paid_prior") === "on" ||
    formData.get("admin_fee_paid_prior") === "true";
  const rawCommitmentTerm = formData.get("commitment_term");
  const newCommitmentTerm =
    typeof rawCommitmentTerm === "string" && rawCommitmentTerm.trim() !== ""
      ? rawCommitmentTerm.trim()
      : null;
  const rawRestrictionsNotes = formData.get("restrictions_notes");
  const newRestrictionsNotes =
    typeof rawRestrictionsNotes === "string" ? rawRestrictionsNotes.trim() : "";
  const rawNotes = formData.get("notes");
  const newNotes = typeof rawNotes === "string" ? rawNotes.trim() : "";
  // Optional fresh staff signature (data URL). When the admin
  // re-signs the amended agreement (same workflow as intake), we
  // store the new signature on the amendment row. When omitted
  // (older callers / dialog-based flow), we fall back to the parent
  // commitment's signature below.
  const rawStaffSignature = formData.get("staff_signature");
  const newStaffSignature =
    typeof rawStaffSignature === "string" && rawStaffSignature.startsWith("data:")
      ? rawStaffSignature
      : null;

  if (!userId) return { error: "Resident is required" };
  if (!Number.isFinite(newRent) || newRent < 0) {
    return { error: "Rent must be a non-negative number" };
  }
  if (hasAdminFee && (!Number.isFinite(newAdminFee) || (newAdminFee ?? 0) < 0)) {
    return { error: "Admin fee must be a non-negative number" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    return { error: "Effective date is required" };
  }
  if (!reason) return { error: "Reason for the change is required" };
  if (rawFrequency && !newFrequency) {
    return { error: "Payment frequency must be weekly or monthly" };
  }

  const admin = createAdminClient();

  // Source commitment = the currently active one. We clone its
  // per-resident/house context so the amended row is a full standalone
  // commitment (not a delta) — easier to render in the signing form
  // and keeps the audit trail simple: one row = one signed PDF.
  const { data: active } = await admin
    .from("house_commitments")
    .select(
      "id, user_id, resident_id, house_id, room_id, bed_id, payment_frequency, rent_amount, admin_fee, rent_due_date, commitment_start_date, commitment_term, restrictions_notes, property_location, notes, staff_signature"
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("commitment_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!active) return { error: "No active commitment to amend" };

  if (
    user.role === "admin"
      ? false
      : !canAccessHouse(user, active.house_id as string)
  ) {
    return { error: "Not authorized" };
  }

  // Guard: unique partial index uq_house_commitments_one_pending_per_user
  // enforces this at the DB level, but a preflight check gives a
  // friendlier error message than the index violation.
  const { data: pending } = await admin
    .from("house_commitments")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending_resident_signature")
    .maybeSingle();
  if (pending) {
    return {
      error:
        "An amendment is already awaiting the resident's signature. Cancel it first before proposing a new one.",
    };
  }

  const { data: inserted, error: insertError } = await admin
    .from("house_commitments")
    .insert({
      user_id: userId,
      resident_id: active.resident_id,
      house_id: active.house_id,
      room_id: active.room_id,
      bed_id: active.bed_id,
      // Amendment may change the frequency (e.g. admin switches a
      // resident from monthly to weekly billing). Fall back to the
      // current commitment's frequency when the form didn't include
      // one — keeps old callers safe.
      payment_frequency: newFrequency ?? active.payment_frequency,
      rent_amount: newRent,
      // Admin fee behaviour on amendments:
      //  - Default (adminFeePaidPrior=true) → carry the fee amount
      //    across for audit/display and skip charge creation; the
      //    one-time fee was already collected on the original
      //    commitment.
      //  - Explicit untick (adminFeePaidPrior=false) → charge the
      //    new admin fee again on the amendment. Rare: used when the
      //    resident re-enrolled or the admin explicitly wants to
      //    levy a new fee.
      admin_fee: hasAdminFee ? (newAdminFee ?? 0) : active.admin_fee,
      skip_initial_admin_fee: adminFeePaidPrior,
      // New rent schedule anchors on the effective date — future
      // rent charges opened against this commitment will use it as
      // their cycle day. Also re-derive the human-readable rent_due_date
      // string from that date so the signed commitment PDF and UI
      // display the new schedule (previously we copied the old string
      // which could read e.g. "1st of each month" even after moving
      // the anchor to the 15th).
      rent_due_date: (() => {
        const [y, m, d] = effectiveDate.split("-").map(Number);
        if (!y || !m || !d) return active.rent_due_date;
        // Policy: rent is due the day BEFORE the anchor. Label the
        // stored rent_due_date accordingly so the PDF + UI read the
        // same day the charge engine actually opens.
        const anchor = new Date(Date.UTC(y, m - 1, d));
        const due = new Date(anchor);
        due.setUTCDate(due.getUTCDate() - 1);
        const freq = (newFrequency ?? active.payment_frequency) as
          | string
          | null;
        if (freq === "weekly") {
          const weekday = due.toLocaleDateString("en-US", {
            timeZone: "UTC",
            weekday: "long",
          });
          return `Every ${weekday}`;
        }
        const ordinal = (n: number) => {
          const s = ["th", "st", "nd", "rd"];
          const v = n % 100;
          return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
        };
        if (d === 1) return "Last day of each preceding month";
        return `${ordinal(d - 1)} of each month`;
      })(),
      commitment_start_date: effectiveDate,
      commitment_term: newCommitmentTerm ?? active.commitment_term,
      property_location: active.property_location,
      restrictions_notes:
        newRestrictionsNotes !== ""
          ? newRestrictionsNotes
          : // Explicit empty string from the form means "clear it";
            // undefined means "not provided by caller → inherit".
            rawRestrictionsNotes === null
            ? (active as { restrictions_notes?: string | null })
                .restrictions_notes ?? null
            : null,
      notes:
        newNotes !== ""
          ? newNotes
          : rawNotes === null
            ? active.notes
            : null,
      // Prefer a freshly-collected staff signature when the amend
      // form provided one (admins re-sign the amended agreement the
      // same way they sign at intake). Fall back to the parent
      // commitment's signature for older callers that don't supply
      // one. The amendment is always attributed to the acting admin
      // via staff_signer_id.
      staff_signature: newStaffSignature ?? active.staff_signature,
      staff_signed_at: new Date().toISOString(),
      staff_signer_id: user.id,
      status: "pending_resident_signature",
      parent_commitment_id: active.id,
      amendment_reason: reason,
      effective_date: effectiveDate,
    })
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  await sendNotification({
    userId,
    type: "commitment_amendment",
    title: "Updated Payment Terms — Signature Required",
    message: `Your payment terms have been updated. Please review and sign the amended commitment.`,
    actionUrl: "/sign-commitment",
    entityType: "house_commitment",
    entityId: inserted.id as string,
  });

  await logActivity({
    houseId: active.house_id as string,
    actorId: user.id,
    eventType: "commitment_amendment_proposed",
    entityType: "house_commitment",
    entityId: inserted.id as string,
    description: `${user.full_name} proposed a payment-terms amendment (new rent $${newRent.toFixed(2)} ${newFrequency ?? active.payment_frequency ?? "monthly"}, effective ${effectiveDate})`,
    metadata: {
      parent_commitment_id: active.id,
      new_rent: newRent,
      new_payment_frequency: newFrequency ?? active.payment_frequency,
      effective_date: effectiveDate,
      reason,
    },
  });

  revalidatePath("/payments");
  revalidatePath(`/residents/${active.resident_id}`);
  revalidatePath("/sign-commitment");
  return {};
}

export async function cancelPendingAmendment(
  commitmentId: string
): Promise<{ error?: string }> {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Not authorized" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("house_commitments")
    .select("id, resident_id, house_id, user_id, parent_commitment_id, status")
    .eq("id", commitmentId)
    .single();

  if (!row) return { error: "Amendment not found" };
  if (row.status !== "pending_resident_signature" || !row.parent_commitment_id) {
    return { error: "Only pending amendments can be cancelled" };
  }

  const { error } = await admin
    .from("house_commitments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", commitmentId);
  if (error) return { error: error.message };

  // Tell the resident the amendment was withdrawn so they don't keep
  // hunting for a non-existent /sign-commitment redirect. Also clears
  // any stale "Signature Required" notification they already had.
  if (row.user_id) {
    await sendNotification({
      userId: row.user_id as string,
      type: "commitment_amendment",
      title: "Payment-terms amendment withdrawn",
      message:
        "The proposed payment-terms amendment was cancelled by staff. Your current terms remain in effect.",
      actionUrl: "/dashboard",
      entityType: "house_commitment",
      entityId: commitmentId,
    });
  }

  await logActivity({
    houseId: row.house_id as string,
    actorId: user.id,
    eventType: "commitment_amendment_cancelled",
    entityType: "house_commitment",
    entityId: commitmentId,
    description: `${user.full_name} cancelled a pending payment-terms amendment`,
  });

  revalidatePath("/payments");
  revalidatePath(`/residents/${row.resident_id}`);
  revalidatePath("/sign-commitment");
  revalidatePath("/dashboard");
  return {};
}

// ──────────────────────────────────────────────────────────
// Inline balance editing — adjust, add, write-off charges
// without requiring a new commitment agreement.
// ──────────────────────────────────────────────────────────

export async function adjustChargeAmount(
  _prev: { error?: string } | null | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Only admins can adjust charges" };

  const parsed = adjustChargeAmountSchema.safeParse({
    charge_id: formData.get("charge_id"),
    new_amount: formData.get("new_amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();

  const { data: charge } = await admin
    .from("payment_charges")
    .select("id, resident_id, house_id, charge_type, amount, paid_amount, status")
    .eq("id", parsed.data.charge_id)
    .single();

  if (!charge) return { error: "Charge not found" };
  if (charge.status !== "open" && charge.status !== "partial") {
    return { error: "Only open or partial charges can be adjusted" };
  }

  if (parsed.data.new_amount < Number(charge.paid_amount)) {
    return {
      error: `New amount cannot be less than already-paid amount ($${Number(charge.paid_amount).toFixed(2)})`,
    };
  }

  const oldAmount = Number(charge.amount);
  const newStatus =
    parsed.data.new_amount === 0
      ? "written_off"
      : parsed.data.new_amount <= Number(charge.paid_amount)
        ? "paid"
        : Number(charge.paid_amount) > 0
          ? "partial"
          : "open";

  const { error } = await admin
    .from("payment_charges")
    .update({
      amount: parsed.data.new_amount,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.charge_id);

  if (error) return { error: error.message };

  await logActivity({
    houseId: charge.house_id as string,
    residentId: charge.resident_id as string,
    actorId: user.id,
    eventType: "charge_adjusted",
    entityType: "payment_charge",
    entityId: charge.id as string,
    description: `${user.full_name} adjusted ${charge.charge_type} charge from $${oldAmount.toFixed(2)} to $${parsed.data.new_amount.toFixed(2)} — ${parsed.data.reason}`,
    metadata: {
      old_amount: oldAmount,
      new_amount: parsed.data.new_amount,
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath(`/residents/${charge.resident_id}`);
  return {};
}

export async function addOneTimeCharge(
  _prev: { error?: string } | null | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Only admins can add charges" };

  const parsed = addOneTimeChargeSchema.safeParse({
    resident_id: formData.get("resident_id"),
    house_id: formData.get("house_id"),
    charge_type: formData.get("charge_type"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    due_date: formData.get("due_date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (
    user.role === "admin"
      ? false
      : !canAccessHouse(user, parsed.data.house_id)
  ) {
    return { error: "Not authorized" };
  }

  const admin = createAdminClient();

  const { data: inserted, error } = await admin
    .from("payment_charges")
    .insert({
      resident_id: parsed.data.resident_id,
      house_id: parsed.data.house_id,
      charge_type: parsed.data.charge_type,
      amount: parsed.data.amount,
      paid_amount: 0,
      due_date: parsed.data.due_date,
      status: "open",
      description: parsed.data.description,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const { data: resident } = await admin
    .from("residents")
    .select("full_name")
    .eq("id", parsed.data.resident_id)
    .single();

  await logActivity({
    houseId: parsed.data.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "charge_added",
    entityType: "payment_charge",
    entityId: inserted.id as string,
    description: `${user.full_name} added $${parsed.data.amount.toFixed(2)} ${parsed.data.charge_type} charge for ${resident?.full_name ?? "resident"} — ${parsed.data.description}`,
    metadata: {
      amount: parsed.data.amount,
      charge_type: parsed.data.charge_type,
      description: parsed.data.description,
      due_date: parsed.data.due_date,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return {};
}

export async function writeOffCharge(
  _prev: { error?: string } | null | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Only admins can write off charges" };

  const parsed = writeOffChargeSchema.safeParse({
    charge_id: formData.get("charge_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();

  const { data: charge } = await admin
    .from("payment_charges")
    .select("id, resident_id, house_id, charge_type, amount, paid_amount, status")
    .eq("id", parsed.data.charge_id)
    .single();

  if (!charge) return { error: "Charge not found" };
  if (charge.status !== "open" && charge.status !== "partial") {
    return { error: "Only open or partial charges can be written off" };
  }

  const remaining = Number(charge.amount) - Number(charge.paid_amount);

  const { error } = await admin
    .from("payment_charges")
    .update({
      status: "written_off",
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.charge_id);

  if (error) return { error: error.message };

  await logActivity({
    houseId: charge.house_id as string,
    residentId: charge.resident_id as string,
    actorId: user.id,
    eventType: "charge_written_off",
    entityType: "payment_charge",
    entityId: charge.id as string,
    description: `${user.full_name} wrote off $${remaining.toFixed(2)} ${charge.charge_type} charge — ${parsed.data.reason}`,
    metadata: {
      amount: Number(charge.amount),
      written_off_amount: remaining,
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath(`/residents/${charge.resident_id}`);
  return {};
}

/**
 * Simple rent terms edit — the lightweight path for changing a
 * resident's rent. Sets amount, weekly/monthly cadence, and the next
 * due date on their active commitment, then re-derives open charges
 * from the new schedule. Unpaid past-due charges are kept (they're
 * owed); only future open rent rows are rebuilt.
 *
 * For changes that need a fresh resident signature (term length,
 * restrictions, etc.) use `proposeAmendment` instead — this is the
 * everyday "rent went up / moved to weekly" tool.
 */
export async function updateRentTerms(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Not authorized" };

  const commitmentId = String(formData.get("commitment_id") ?? "");
  const rentAmount = Number(formData.get("rent_amount"));
  const frequency = String(formData.get("payment_frequency") ?? "");
  const nextDue = String(formData.get("next_due_date") ?? "");
  const rawAdminFee = String(formData.get("admin_fee") ?? "").trim();
  const adminFee = rawAdminFee === "" ? null : Number(rawAdminFee);

  if (!commitmentId) return { error: "Missing commitment" };
  if (!Number.isFinite(rentAmount) || rentAmount <= 0) {
    return { error: "Rent must be a positive amount" };
  }
  if (frequency !== "weekly" && frequency !== "monthly") {
    return { error: "Frequency must be weekly or monthly" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) {
    return { error: "Next due date is required" };
  }
  if (adminFee !== null && (!Number.isFinite(adminFee) || adminFee < 0)) {
    return { error: "Admin fee must be a non-negative number" };
  }

  const admin = createAdminClient();
  const { data: commitment } = await admin
    .from("house_commitments")
    .select("id, resident_id, house_id, status")
    .eq("id", commitmentId)
    .maybeSingle();

  if (!commitment || commitment.status !== "active") {
    return { error: "No active commitment found" };
  }

  const { data: commitmentHouse } = await admin
    .from("houses")
    .select("workspace_id")
    .eq("id", commitment.house_id)
    .maybeSingle();
  if (
    !commitmentHouse ||
    commitmentHouse.workspace_id !== user.workspace_id
  ) {
    return { error: "No active commitment found" };
  }

  // The anchor for the next cycle is the day AFTER the due date
  // (rent is due the day before the period it covers).
  const anchorDate = new Date(`${nextDue}T12:00:00`);
  anchorDate.setDate(anchorDate.getDate() + 1);
  const anchorIso = anchorDate.toISOString().slice(0, 10);

  const { error } = await admin
    .from("house_commitments")
    .update({
      rent_amount: rentAmount,
      payment_frequency: frequency,
      billing_anchor_date: anchorIso,
      admin_fee: adminFee,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commitmentId);
  if (error) return { error: error.message };

  // Rebuild the open rent schedule under the new terms. Clearing
  // every OPEN rent row (not just future ones) keeps an earlier
  // same-month anchor from skipping the requested cycle; the opener
  // re-creates every charge due ≤ today at the new terms.
  await admin
    .from("payment_charges")
    .delete()
    .eq("commitment_id", commitmentId)
    .eq("charge_type", "rent")
    .eq("status", "open");
  await openRentChargesForCommitment(commitmentId);

  // Keep an open admin-fee charge in sync with the new value:
  // null clears it, otherwise the latest amount wins.
  if (adminFee === null) {
    await admin
      .from("payment_charges")
      .delete()
      .eq("commitment_id", commitmentId)
      .eq("charge_type", "admin_fee")
      .eq("status", "open");
  } else {
    await admin
      .from("payment_charges")
      .update({ amount: adminFee })
      .eq("commitment_id", commitmentId)
      .eq("charge_type", "admin_fee")
      .in("status", ["open", "partial"]);
  }

  const { data: resident } = await admin
    .from("residents")
    .select("full_name")
    .eq("id", commitment.resident_id)
    .maybeSingle();

  await logActivity({
    houseId: commitment.house_id as string,
    residentId: (commitment.resident_id as string | null) ?? undefined,
    actorId: user.id,
    eventType: "rent_terms_updated",
    entityType: "house_commitment",
    entityId: commitmentId,
    description: `Rent terms updated for ${resident?.full_name ?? "resident"}: $${rentAmount}/${frequency === "weekly" ? "wk" : "mo"}, next due ${nextDue}`,
    metadata: {
      rent_amount: rentAmount,
      payment_frequency: frequency,
      next_due: nextDue,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  if (commitment.resident_id) {
    revalidatePath(`/residents/${commitment.resident_id}`);
  }
  return {};
}
