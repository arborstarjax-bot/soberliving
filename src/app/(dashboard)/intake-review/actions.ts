"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { sendNotification, notifyHouseStaff } from "@/lib/notifications";
import {
  openAllChargesForCommitment,
  addMonthsClamped,
  parseIsoDate,
  toIsoDate,
} from "@/lib/payments/charges";
import { generateReceiptPdf } from "@/lib/payments/receipt-pdf";
import { z } from "zod";

const FACILITY_NAME = "Sober Living";

const moveInPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["cash", "check", "money_order", "venmo", "zelle", "other"]),
  paidAt: z.string().min(1),
  note: z.string().optional(),
});

const checkInRestrictionSchema = z.object({
  restriction_type: z.string().min(1),
  description: z.string().min(1, "Restriction description is required"),
  end_date: z.string().optional(),
});

const completeIntakeReviewSchema = z.object({
  userId: z.string().uuid(),
  houseId: z.string().uuid(),
  roomId: z.string().uuid(),
  bedId: z.string().uuid(),
  paymentFrequency: z.enum(["weekly", "monthly"]),
  rentAmount: z.number().positive(),
  adminFee: z.number().min(0),
  rentDueDate: z.string().min(1),
  commitmentStartDate: z.string().min(1),
  commitmentTerm: z.string().min(1),
  notes: z.string().optional(),
  staffSignature: z.string().min(1, "Staff signature is required"),
  checkInRestrictions: z.array(checkInRestrictionSchema).optional(),
  // Move-in payment — null when "no payment collected" is checked.
  moveInPayment: moveInPaymentSchema.nullable().optional(),
});

export async function completeIntakeReview(formData: z.infer<typeof completeIntakeReviewSchema>) {
  // Intake is admin-only. Managers handle operational intake (in-person
  // logistics, move-in day) but don't approve/deny or assign housing.
  const currentUser = await requireRole("admin");
  const adminClient = createAdminClient();

  const parsed = completeIntakeReviewSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const data = parsed.data;

  // Get the user + their intake form data
  const { data: targetUser } = await adminClient
    .from("users")
    .select("id, full_name, email, phone, intake_completed")
    .eq("id", data.userId)
    .single();

  if (!targetUser) return { error: "User not found" };
  if (!targetUser.intake_completed) return { error: "User has not completed intake form" };

  // Get intake form data to populate resident profile
  const { data: intakeForm } = await adminClient
    .from("intake_forms")
    .select("form_data")
    .eq("user_id", data.userId)
    .eq("status", "completed")
    .single();

  const fd = (intakeForm?.form_data ?? {}) as Record<string, unknown>;

  // Get house info for property_location
  const { data: house } = await adminClient
    .from("houses")
    .select("name, address")
    .eq("id", data.houseId)
    .single();

  const propertyLocation = house?.address || house?.name || "";

  // Create or update resident record from intake data
  const residentPayload = {
    user_id: data.userId,
    house_id: data.houseId,
    full_name: targetUser.full_name,
    date_of_birth: (fd.date_of_birth as string) || null,
    phone: targetUser.phone || (fd.phone as string) || null,
    email: targetUser.email,
    emergency_contact_name: (fd.emergency_contact_1_name as string) || "Not provided",
    emergency_contact_phone: (fd.emergency_contact_1_phone as string) || "Not provided",
    emergency_contact_relationship: (fd.emergency_contact_1_relationship as string) || null,
    sobriety_date: (fd.sobriety_date as string) || null,
    move_in_date: data.commitmentStartDate,
    status: "active" as const,
    updated_at: new Date().toISOString(),
  };

  // Check if resident record already exists
  const { data: existingResident } = await adminClient
    .from("residents")
    .select("id")
    .eq("user_id", data.userId)
    .eq("status", "active")
    .maybeSingle();

  let residentId: string;

  if (existingResident) {
    await adminClient
      .from("residents")
      .update(residentPayload)
      .eq("id", existingResident.id);
    residentId = existingResident.id;
  } else {
    const { data: newResident, error: resError } = await adminClient
      .from("residents")
      .insert(residentPayload)
      .select("id")
      .single();
    if (resError || !newResident) return { error: resError?.message || "Failed to create resident record" };
    residentId = newResident.id;
  }

  // End any existing active bed assignment for this resident, then create
  // a fresh assignment on the selected bed. Intake requires a concrete
  // bed (enforced by the `bedId: z.string().uuid()` schema), so there is
  // no "no bed" code path here — bed-empty state is handled by the
  // occupancy grid's "Mark Not Available" button instead.
  await adminClient
    .from("bed_assignments")
    .update({ end_date: new Date().toISOString().split("T")[0] })
    .eq("resident_id", residentId)
    .is("end_date", null);

  const { error: bedError } = await adminClient
    .from("bed_assignments")
    .insert({
      resident_id: residentId,
      bed_id: data.bedId,
      start_date: data.commitmentStartDate,
      assigned_by: currentUser.id,
    });

  if (bedError) {
    return { error: `Bed assignment failed: ${bedError.message}` };
  }

  // Create house commitment record
  const { data: commitmentRow, error: commitError } = await adminClient
    .from("house_commitments")
    .insert({
      user_id: data.userId,
      resident_id: residentId,
      house_id: data.houseId,
      room_id: data.roomId,
      bed_id: data.bedId,
      payment_frequency: data.paymentFrequency,
      rent_amount: data.rentAmount,
      admin_fee: data.adminFee,
      rent_due_date: data.rentDueDate,
      commitment_start_date: data.commitmentStartDate,
      commitment_term: data.commitmentTerm,
      property_location: propertyLocation,
      notes: data.notes || null,
      staff_signature: data.staffSignature,
      staff_signed_at: new Date().toISOString(),
      staff_signer_id: currentUser.id,
      status: "pending_resident_signature",
    })
    .select("id")
    .single();

  if (commitError || !commitmentRow) {
    return { error: `Commitment creation failed: ${commitError?.message ?? "unknown"}` };
  }

  const commitmentId = commitmentRow.id as string;

  // Create check-in restrictions if provided
  if (data.checkInRestrictions && data.checkInRestrictions.length > 0) {
    for (const restriction of data.checkInRestrictions) {
      await adminClient
        .from("restrictions")
        .insert({
          resident_id: residentId,
          house_id: data.houseId,
          restriction_type: restriction.restriction_type,
          description: restriction.description,
          start_date: data.commitmentStartDate,
          end_date: restriction.end_date || null,
          is_house_commitment: true,
          created_by: currentUser.id,
        });
    }
  }

  // ── Move-in payment ─────────────────────────────────────────────
  // When the admin collects a payment at move-in we:
  //   1. Open the admin_fee + first-cycle rent charges early (before
  //      the resident signs) so there's a real charge row to apply to.
  //   2. Allocate admin-fee-first, remainder to rent.
  //   3. Record ONE payments row, generate receipt PDF, link it.
  // `openAllChargesForCommitment` is idempotent via upsert, so when
  // the resident signs later and `markIntakeComplete` re-opens
  // charges, duplicates are harmlessly ignored.
  if (data.moveInPayment) {
    const mi = data.moveInPayment;

    // Open charges early — the helpers gate on status=active, so we
    // inline the insert directly. Idempotent via unique index, but
    // because `ignoreDuplicates: true` means "first insert wins", we
    // MUST write the same shape `openRentChargesForCommitment` would,
    // including period_start / period_end. Otherwise when
    // markIntakeComplete later calls openAllChargesForCommitment it
    // sees the row already exists and skips it, and the rent charge
    // is permanently stuck with NULL period fields (breaking the
    // payments UI's "Period" line and the receipt PDF).
    const rentPeriodStart = data.commitmentStartDate;
    const rentPeriodEnd = toIsoDate(
      addMonthsClamped(parseIsoDate(data.commitmentStartDate), 1)
    );

    const chargeRows: Array<{
      resident_id: string;
      house_id: string;
      commitment_id: string;
      charge_type: string;
      amount: number;
      due_date: string;
      period_start?: string;
      period_end?: string;
    }> = [];

    if (data.adminFee > 0) {
      chargeRows.push({
        resident_id: residentId,
        house_id: data.houseId,
        commitment_id: commitmentId,
        charge_type: "admin_fee",
        amount: data.adminFee,
        due_date: data.commitmentStartDate,
      });
    }
    chargeRows.push({
      resident_id: residentId,
      house_id: data.houseId,
      commitment_id: commitmentId,
      charge_type: "rent",
      amount: data.rentAmount,
      due_date: data.commitmentStartDate,
      period_start: rentPeriodStart,
      period_end: rentPeriodEnd,
    });

    if (chargeRows.length > 0) {
      await adminClient.from("payment_charges").upsert(chargeRows, {
        onConflict: "resident_id,due_date,charge_type",
        ignoreDuplicates: true,
      });
    }

    // Re-read the freshly opened charges to get their IDs.
    const { data: openCharges } = await adminClient
      .from("payment_charges")
      .select("id, charge_type, amount")
      .eq("resident_id", residentId)
      .eq("commitment_id", commitmentId)
      .eq("due_date", data.commitmentStartDate)
      .in("charge_type", ["admin_fee", "rent"]);

    const adminFeeCharge = (openCharges ?? []).find(
      (c) => (c.charge_type as string) === "admin_fee"
    );
    const rentCharge = (openCharges ?? []).find(
      (c) => (c.charge_type as string) === "rent"
    );

    // Allocate: admin fee first, then rent.
    let remaining = mi.amount;
    const allocations: Array<{ chargeId: string; applied: number; chargeType: string }> = [];

    if (adminFeeCharge && remaining > 0) {
      const apply = Math.min(remaining, Number(adminFeeCharge.amount));
      allocations.push({ chargeId: adminFeeCharge.id as string, applied: apply, chargeType: "admin_fee" });
      remaining -= apply;
    }
    if (rentCharge && remaining > 0) {
      const apply = Math.min(remaining, Number(rentCharge.amount));
      allocations.push({ chargeId: rentCharge.id as string, applied: apply, chargeType: "rent" });
      remaining -= apply;
    }

    // Build the note with allocation breakdown for the receipt.
    const breakdownParts = allocations.map(
      (a) => `${a.chargeType === "admin_fee" ? "Admin Fee" : "Rent"}: $${a.applied.toFixed(2)}`
    );
    const autoNote = `Move-in payment (${breakdownParts.join(" / ")})`;
    const fullNote = mi.note ? `${autoNote}\n${mi.note}` : autoNote;

    // Allocate a receipt number.
    let receiptNumber: string | null = null;
    try {
      const { data: rn, error: rnErr } = await adminClient.rpc("next_receipt_number", {
        p_year: new Date().getFullYear(),
      });
      if (!rnErr && rn) receiptNumber = rn as unknown as string;
    } catch (e) {
      console.error("Receipt number allocation failed", e);
    }

    // Record one payments row covering the full collected amount.
    // Link to the first charge so the ledger shows the association.
    const primaryChargeId = allocations[0]?.chargeId ?? null;
    const { data: paymentRow, error: payErr } = await adminClient
      .from("payments")
      .insert({
        resident_id: residentId,
        house_id: data.houseId,
        amount: mi.amount,
        payment_type: "deposit",
        payment_method: mi.method,
        note: fullNote,
        status: "completed",
        due_date: data.commitmentStartDate,
        paid_at: mi.paidAt,
        recorded_by: currentUser.id,
        charge_id: primaryChargeId,
        receipt_number: receiptNumber,
      })
      .select("id")
      .single();

    if (payErr) {
      console.error("Move-in payment insert failed:", payErr.message);
    }

    // Apply to each charge atomically.
    const paymentId = paymentRow?.id as string | undefined;
    for (const alloc of allocations) {
      if (paymentId) {
        await adminClient.rpc("apply_payment_to_charge", {
          p_charge_id: alloc.chargeId,
          p_amount: alloc.applied,
          p_payment_id: paymentId,
        });
      }
    }

    // Generate + upload receipt PDF.
    if (receiptNumber && paymentId && targetUser) {
      try {
        const pdfBytes = await generateReceiptPdf({
          receiptNumber,
          paidAt: mi.paidAt,
          facilityName: FACILITY_NAME,
          houseName: house?.name ?? "",
          houseAddress: house?.address ?? null,
          residentName: targetUser.full_name,
          amount: mi.amount,
          paymentType: "Move-In Deposit",
          paymentMethod: mi.method,
          dueDate: data.commitmentStartDate,
          note: fullNote,
          recordedByName: currentUser.full_name,
        });

        const fileName = `${data.userId}/receipts/${receiptNumber}.pdf`;
        const { error: uploadError } = await adminClient.storage
          .from("documents")
          .upload(fileName, pdfBytes, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (!uploadError) {
          const { data: docRow } = await adminClient
            .from("documents")
            .insert({
              user_id: data.userId,
              name: `Move-In Receipt ${receiptNumber}`,
              document_type: "payment_receipt",
              storage_path: fileName,
              file_size: pdfBytes.byteLength,
            })
            .select("id")
            .single();

          await adminClient
            .from("payments")
            .update({
              receipt_storage_path: fileName,
              receipt_document_id: docRow?.id ?? null,
            })
            .eq("id", paymentId);
        }
      } catch (e) {
        console.error("Move-in receipt PDF generation failed", e);
      }
    }
  }

  await logActivity({
    actorId: currentUser.id,
    eventType: "intake_review_completed",
    entityType: "user",
    entityId: data.userId,
    description: `${currentUser.full_name} completed intake review for ${targetUser.full_name} — assigned to ${house?.name || "house"}${data.moveInPayment ? ` (move-in payment: $${data.moveInPayment.amount.toFixed(2)})` : ""}`,
  });

  // Notify the applicant that their application was approved and there's
  // a commitment waiting for their signature, plus admins + this house's
  // managers for awareness. Skip the acting staff member.
  await sendNotification({
    userId: data.userId,
    type: "intake_approved",
    title: "Application Approved",
    message: `Your application was approved. Please sign your house commitment to finalize your move-in at ${house?.name ?? "your assigned house"}.`,
    actionUrl: "/sign-commitment",
    entityType: "user",
    entityId: data.userId,
  });

  await notifyHouseStaff(
    data.houseId,
    {
      type: "intake_approved",
      title: "Intake Application Approved",
      message: `${currentUser.full_name} approved ${targetUser.full_name}'s application for ${house?.name ?? "this house"}.`,
      actionUrl: "/intake-review?tab=approved",
      entityType: "user",
      entityId: data.userId,
    },
    { excludeUserId: currentUser.id }
  );

  revalidatePath("/intake-review");
  revalidatePath("/users");
  revalidatePath("/residents");
  revalidatePath("/discipline");
  return {};
}

export async function markIntakeComplete(userId: string) {
  const currentUser = await requireRole("admin");
  const adminClient = createAdminClient();

  const { data: targetUser } = await adminClient
    .from("users")
    .select("id, full_name")
    .eq("id", userId)
    .single();

  if (!targetUser) return { error: "User not found" };

  // Mark commitment as active (resident signed). We select the row
  // back so we can seed the initial charges — without this call the
  // resident lands on their dashboard with no Next Due card and the
  // payment ledger stays empty until a charge is manually created.
  // Also grab resident_id so we can revalidate the resident detail
  // page (this action is now also called from the resident payments
  // panel, where the draft card otherwise stays visible until manual
  // refresh).
  const { data: activated } = await adminClient
    .from("house_commitments")
    .update({
      status: "active",
      resident_signed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "pending_resident_signature")
    .select("id, resident_id")
    .maybeSingle();

  // Mark user as commitment signed
  const { error } = await adminClient
    .from("users")
    .update({ commitment_signed: true })
    .eq("id", userId);

  if (error) return { error: error.message };

  // Seed admin_fee + first rent charge immediately so the Payments
  // views have something to show as soon as the admin finishes
  // intake. Idempotent via the unique (resident_id, due_date,
  // charge_type) index so re-runs are safe.
  if (activated?.id) {
    try {
      await openAllChargesForCommitment(activated.id);
    } catch (e) {
      console.error(
        "Failed to open initial charges after intake activation",
        activated.id,
        e
      );
    }
  }

  await logActivity({
    actorId: currentUser.id,
    eventType: "intake_marked_complete",
    entityType: "user",
    entityId: userId,
    description: `${currentUser.full_name} manually marked intake as complete for ${targetUser.full_name}`,
  });

  revalidatePath("/intake-review");
  revalidatePath("/users");
  if (activated?.resident_id) {
    revalidatePath(`/residents/${activated.resident_id}`);
  }
  return {};
}

// ──────────────────────────────────────────────────────────
// Edit / resend a pending (unsigned) house commitment.
//
// Different from proposeAmendment: that targets an ACTIVE commitment
// and creates a new row with parent_commitment_id. This updates the
// ORIGINAL pending row in place because no PDF has been signed yet
// and no charges have opened — the commitment is still a draft.
// ──────────────────────────────────────────────────────────

const updatePendingCommitmentSchema = z.object({
  userId: z.string().uuid(),
  paymentFrequency: z.enum(["weekly", "monthly"]),
  rentAmount: z.number().positive(),
  adminFee: z.number().min(0),
  rentDueDate: z.string().min(1),
  commitmentStartDate: z.string().min(1),
  commitmentTerm: z.string().min(1),
  notes: z.string().optional(),
});

export async function updatePendingCommitment(
  formData: z.infer<typeof updatePendingCommitmentSchema>
) {
  const currentUser = await requireRole("admin");
  const adminClient = createAdminClient();

  const parsed = updatePendingCommitmentSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  // Find the pending commitment. Only one can exist per user (enforced
  // by uq_house_commitments_one_pending_per_user). Guard against the
  // zero-row case so we give a clear message instead of a cryptic
  // update-affected-0-rows outcome.
  const { data: pending } = await adminClient
    .from("house_commitments")
    .select("id, user_id, resident_id, house_id, parent_commitment_id")
    .eq("user_id", data.userId)
    .eq("status", "pending_resident_signature")
    .is("parent_commitment_id", null)
    .maybeSingle();

  if (!pending) {
    return {
      error:
        "No pending commitment found for this user. It may already be signed or cancelled.",
    };
  }

  const { error: updErr } = await adminClient
    .from("house_commitments")
    .update({
      payment_frequency: data.paymentFrequency,
      rent_amount: data.rentAmount,
      admin_fee: data.adminFee,
      rent_due_date: data.rentDueDate,
      commitment_start_date: data.commitmentStartDate,
      commitment_term: data.commitmentTerm,
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pending.id);

  if (updErr) {
    return { error: `Update failed: ${updErr.message}` };
  }

  // Notify the resident again — the prior notification may have been
  // missed or the terms may have changed meaningfully.
  await sendNotification({
    userId: data.userId,
    type: "commitment_updated",
    title: "Updated Commitment — Signature Required",
    message:
      "Your house commitment has been updated. Please review and sign the latest version.",
    actionUrl: "/sign-commitment",
    entityType: "house_commitment",
    entityId: pending.id as string,
  });

  await logActivity({
    actorId: currentUser.id,
    eventType: "pending_commitment_updated",
    entityType: "house_commitment",
    entityId: pending.id as string,
    description: `${currentUser.full_name} edited the pending commitment (rent $${data.rentAmount.toFixed(2)}, admin fee $${data.adminFee.toFixed(2)}, starts ${data.commitmentStartDate})`,
  });

  revalidatePath("/intake-review");
  revalidatePath(`/residents/${pending.resident_id}`);
  revalidatePath("/sign-commitment");
  return {};
}

export async function resendPendingCommitmentNotification(userId: string) {
  const currentUser = await requireRole("admin");
  const adminClient = createAdminClient();

  const { data: pending } = await adminClient
    .from("house_commitments")
    .select("id, resident_id")
    .eq("user_id", userId)
    .eq("status", "pending_resident_signature")
    .is("parent_commitment_id", null)
    .maybeSingle();

  if (!pending) {
    return {
      error:
        "No pending commitment found for this user. It may already be signed.",
    };
  }

  await sendNotification({
    userId,
    type: "commitment_reminder",
    title: "Reminder — House Commitment Awaiting Signature",
    message:
      "Your house commitment is ready for signature. Please review and sign to finalize your move-in.",
    actionUrl: "/sign-commitment",
    entityType: "house_commitment",
    entityId: pending.id as string,
  });

  await logActivity({
    actorId: currentUser.id,
    eventType: "pending_commitment_resent",
    entityType: "house_commitment",
    entityId: pending.id as string,
    description: `${currentUser.full_name} resent the pending commitment signature request`,
  });

  return {};
}

export async function denyIntakeApplication(userId: string, reason: string) {
  // Denial is admin-only. Managers can assign/approve applicants but
  // only admins can mark an application rejected (matches the user's
  // policy: admin trumps manager on terminal actions).
  const currentUser = await requireRole("admin");
  const adminClient = createAdminClient();

  const trimmedReason = (reason ?? "").trim();
  if (!trimmedReason) return { error: "A denial reason is required" };

  const { data: targetUser } = await adminClient
    .from("users")
    .select("id, full_name, account_status")
    .eq("id", userId)
    .single();

  if (!targetUser) return { error: "User not found" };
  if ((targetUser as { account_status?: string }).account_status === "rejected") {
    return { error: "Application is already denied" };
  }

  // Soft delete: flip account_status so login routes them to the
  // application-denied page. Intake form rows stay in place for audit
  // history, and the denial reason is surfaced to the applicant.
  const { error } = await adminClient
    .from("users")
    .update({
      account_status: "rejected",
      denial_reason: trimmedReason,
      denied_at: new Date().toISOString(),
      denied_by: currentUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { error: error.message };

  await logActivity({
    actorId: currentUser.id,
    eventType: "intake_application_denied",
    entityType: "user",
    entityId: userId,
    description: `${currentUser.full_name} denied ${targetUser.full_name}'s intake application — ${trimmedReason}`,
  });

  revalidatePath("/intake-review");
  return {};
}

export async function reopenIntakeApplication(userId: string) {
  // Reopen is admin-only — mirrors denial. Clears the rejection fields
  // and returns the user's application to the Pending tab (no commitment
  // row was ever created, so the partition logic picks it up again).
  const currentUser = await requireRole("admin");
  const adminClient = createAdminClient();

  const { data: targetUser } = await adminClient
    .from("users")
    .select("id, full_name, account_status")
    .eq("id", userId)
    .single();

  if (!targetUser) return { error: "User not found" };
  if ((targetUser as { account_status?: string }).account_status !== "rejected") {
    return { error: "Application is not in the denied state" };
  }

  const { error } = await adminClient
    .from("users")
    .update({
      account_status: "active",
      denial_reason: null,
      denied_at: null,
      denied_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) return { error: error.message };

  await logActivity({
    actorId: currentUser.id,
    eventType: "intake_application_reopened",
    entityType: "user",
    entityId: userId,
    description: `${currentUser.full_name} reopened ${targetUser.full_name}'s denied intake application`,
  });

  // Let the applicant know they can come back in. Their intake packet
  // is preserved, so they land on the dashboard and staff reviews them
  // from Intake Review's Pending tab.
  await sendNotification({
    userId,
    type: "intake_reopened",
    title: "Application Reopened",
    message: "Your application has been reopened for review. Please log in to continue.",
    actionUrl: "/dashboard",
    entityType: "user",
    entityId: userId,
  });

  revalidatePath("/intake-review");
  return {};
}

export type RoomWithAvailability = {
  id: string;
  name: string;
  beds: { id: string; label: string; is_active: boolean }[];
};

export type GetRoomsForHouseResult =
  | { ok: true; rooms: RoomWithAvailability[] }
  | { ok: false; error: string };

// Returns a structured result instead of throwing. Next.js scrubs
// thrown Error messages in production (“The specific message is
// omitted…”), which hid real failures like permission errors on
// the rooms table. Returning the error as data lets the client
// surface it verbatim.
export async function getRoomsForHouse(
  houseId: string
): Promise<GetRoomsForHouseResult> {
  // requireRole() uses next/navigation's redirect(), which throws
  // a special NEXT_REDIRECT error that the framework intercepts.
  // It MUST propagate — a generic try/catch around it would
  // silently swallow the redirect. So it stays outside the try.
  await requireRole("admin");
  const adminClient = createAdminClient();

  // Wrap the DB work in try/catch so any runtime error (missing
  // SUPABASE_SERVICE_ROLE_KEY, network failure, unexpected throw)
  // comes back as structured data instead of a thrown error whose
  // message Next.js would scrub in production.
  try {
    const { data: rooms, error: roomsError } = await adminClient
      .from("rooms")
      .select("id, name, beds(id, label, is_active)")
      .eq("house_id", houseId)
      .eq("is_active", true)
      .order("name");

    if (roomsError) {
      console.error("[getRoomsForHouse] rooms query failed:", roomsError);
      return {
        ok: false,
        error: `Could not load rooms: ${roomsError.message}`,
      };
    }

    // Get all active bed assignments for this house to determine occupied beds
    const { data: activeBedAssignments, error: assignmentsError } =
      await adminClient
        .from("bed_assignments")
        .select("bed_id")
        .is("end_date", null);

    if (assignmentsError) {
      console.error(
        "[getRoomsForHouse] bed_assignments query failed:",
        assignmentsError
      );
      return {
        ok: false,
        error: `Could not load bed assignments: ${assignmentsError.message}`,
      };
    }

    const occupiedBedIds = new Set(
      (activeBedAssignments ?? []).map((a) => a.bed_id)
    );

    // Filter beds: only include active beds that are NOT occupied
    // Filter rooms: only include rooms that have at least one available bed
    const roomsWithAvailability = (rooms ?? [])
      .map((room) => ({
        ...room,
        beds: (room.beds ?? []).filter(
          (bed: { id: string; label: string; is_active: boolean }) =>
            bed.is_active && !occupiedBedIds.has(bed.id)
        ),
      }))
      .filter((room) => room.beds.length > 0);

    return { ok: true, rooms: roomsWithAvailability };
  } catch (err) {
    console.error("[getRoomsForHouse] unexpected throw:", err);
    const message =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return { ok: false, error: `Unexpected error: ${message}` };
  }
}
