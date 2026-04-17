"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { sendNotification, notifyHouseStaff } from "@/lib/notifications";
import { openAllChargesForCommitment } from "@/lib/payments/charges";
import { z } from "zod";

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
  const { error: commitError } = await adminClient
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
    });

  if (commitError) {
    return { error: `Commitment creation failed: ${commitError.message}` };
  }

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

  await logActivity({
    actorId: currentUser.id,
    eventType: "intake_review_completed",
    entityType: "user",
    entityId: data.userId,
    description: `${currentUser.full_name} completed intake review for ${targetUser.full_name} — assigned to ${house?.name || "house"}`,
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
  const { data: activated } = await adminClient
    .from("house_commitments")
    .update({
      status: "active",
      resident_signed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "pending_resident_signature")
    .select("id")
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

export async function getRoomsForHouse(houseId: string) {
  await requireRole("admin");
  const adminClient = createAdminClient();

  const { data: rooms } = await adminClient
    .from("rooms")
    .select("id, name, beds(id, label, is_active)")
    .eq("house_id", houseId)
    .eq("is_active", true)
    .order("name");

  // Get all active bed assignments for this house to determine occupied beds
  const { data: activeBedAssignments } = await adminClient
    .from("bed_assignments")
    .select("bed_id")
    .is("end_date", null);

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

  return roomsWithAvailability;
}
