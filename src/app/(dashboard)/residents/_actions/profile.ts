"use server";
import { err, okVoid, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createResidentSchema, updateResidentSchema, createNoteSchema } from "@/lib/validations";
import { sendNotification } from "@/lib/notifications";
import { sendApplicationEmail } from "@/lib/email";
import { getAppOrigin } from "@/lib/app-url";

// Shapes returned by PostgREST joins. TS can't parse the select string,
// so we narrow the joined rows centrally instead of casting at each access.


// --- Residents ---

// Shapes returned by PostgREST joins. TS can't parse the select string,
// so we narrow the joined rows centrally instead of casting at each access.

export async function createResident(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createResidentSchema.safeParse({
    house_id: formData.get("house_id"),
    full_name: formData.get("full_name"),
    date_of_birth: formData.get("date_of_birth") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    emergency_contact_name: formData.get("emergency_contact_name"),
    emergency_contact_phone: formData.get("emergency_contact_phone"),
    emergency_contact_relationship:
      formData.get("emergency_contact_relationship") || undefined,
    sobriety_date: formData.get("sobriety_date") || undefined,
    move_in_date: formData.get("move_in_date"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  if (
    !canAccessHouse(user, parsed.data.house_id)
  ) {
    return err("Not authorized for this house");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("residents")
    .insert({
      ...parsed.data,
      status: "active",
    })
    .select("id")
    .single();

  if (error) return err(error.message);

  await logActivity({
    houseId: parsed.data.house_id,
    residentId: data.id,
    actorId: user.id,
    eventType: "move_in",
    entityType: "resident",
    entityId: data.id,
    description: `${parsed.data.full_name} moved in, added by ${user.full_name}`,
  });

  revalidatePath("/residents");
  revalidatePath(`/houses/${parsed.data.house_id}`);
  redirect(`/residents/${data.id}`);
}

export async function updateResident(residentId: string, formData: FormData) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id")
    .eq("id", residentId)
    .maybeSingle();

  if (!resident) return err("Resident not found");
  if (
    !canAccessHouse(user, resident.house_id)
  ) {
    return err("Not authorized");
  }

  // Use null for cleared fields (empty string) vs undefined for absent fields
  function fieldVal(key: string): string | null | undefined {
    if (!formData.has(key)) return undefined; // field absent — don't update
    const v = formData.get(key) as string;
    return v === "" ? null : v; // empty string — clear to null
  }

  const parsed = updateResidentSchema.safeParse({
    full_name: formData.get("full_name") || undefined, // name should never be cleared
    date_of_birth: fieldVal("date_of_birth"),
    phone: fieldVal("phone"),
    email: fieldVal("email"),
    emergency_contact_name: fieldVal("emergency_contact_name"),
    emergency_contact_phone: fieldVal("emergency_contact_phone"),
    emergency_contact_relationship: fieldVal("emergency_contact_relationship"),
    sobriety_date: fieldVal("sobriety_date"),
    // move_in_date must always have a value — never write an empty
    // string back; skip the key when blank so the DB keeps its value.
    move_in_date: formData.get("move_in_date") || undefined,
    move_out_date: fieldVal("move_out_date"),
    notes: fieldVal("notes"),
  });

  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const { error } = await supabase
    .from("residents")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", residentId);

  if (error) return err(error.message);

  await logActivity({
    houseId: resident.house_id,
    residentId,
    actorId: user.id,
    eventType: "resident_updated",
    entityType: "resident",
    entityId: residentId,
    description: `Resident profile updated by ${user.full_name}`,
  });

  revalidatePath(`/residents/${residentId}`);
  return okVoid();
}

export async function updateResidentForcePhoto(
  residentId: string,
  forcePhoto: boolean
) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", residentId)
    .maybeSingle();

  if (!resident) return err("Resident not found");
  if (!canAccessHouse(user, resident.house_id)) {
    return err("Not authorized");
  }

  const { error } = await supabase
    .from("residents")
    .update({ force_photo: forcePhoto, updated_at: new Date().toISOString() })
    .eq("id", residentId);

  if (error) return err(error.message);

  await logActivity({
    houseId: resident.house_id,
    residentId,
    actorId: user.id,
    eventType: "resident_updated",
    entityType: "resident",
    entityId: residentId,
    description: `Force photo ${forcePhoto ? "enabled" : "disabled"} for ${resident.full_name} by ${user.full_name}`,
  });

  revalidatePath(`/residents/${residentId}`);
  return okVoid();
}

// --- Bed Assignments ---

export async function createNote(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createNoteSchema.safeParse({
    resident_id: formData.get("resident_id"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return err(parsed.error.issues[0].message);
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", parsed.data.resident_id)
    .maybeSingle();

  if (!resident) return err("Resident not found");
  if (
    !canAccessHouse(user, resident.house_id)
  ) {
    return err("Not authorized");
  }

  const { data, error } = await supabase
    .from("resident_notes")
    .insert({
      resident_id: parsed.data.resident_id,
      author_id: user.id,
      content: parsed.data.content,
    })
    .select("id")
    .single();

  if (error) return err(error.message);

  await logActivity({
    houseId: resident.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "note_added",
    entityType: "resident_note",
    entityId: data.id,
    description: `Note added to ${resident.full_name} by ${user.full_name}`,
  });

  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return okVoid();
}

// ── Reinstate a discharged resident ─────────────────────────────
// Treats reinstatement as a fresh sign-in: resets intake/commitment
// flags so the resident must redo onboarding per workspace settings.

export async function resendApplicationToResident(residentId: string) {
  const currentUser = await requireAuth();
  if (currentUser.role !== "admin") {
    return err("Only admins can resend applications");
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("id, full_name, user_id, house_id, status")
    .eq("id", residentId)
    .maybeSingle();

  if (!resident) return err("Resident not found");
  if (resident.status !== "active") {
    return err("Can only resend applications to active residents");
  }
  if (!canAccessHouse(currentUser, resident.house_id)) {
    return err("Not authorized");
  }

  const residentUserId = resident.user_id as string | null;
  if (!residentUserId) {
    return err("Resident has no linked user account");
  }

  // Reset intake so the resident is routed to the intake wizard.
  // Keep commitment_signed untouched — this is a redo of the application
  // only, not a full re-intake (no bed reassignment needed).
  await adminClient
    .from("users")
    .update({
      intake_completed: false,
      application_resent: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", residentUserId);

  // Delete old intake form draft/completed so the wizard starts fresh
  await adminClient
    .from("intake_forms")
    .delete()
    .eq("user_id", residentUserId);

  // Send the application email
  const { data: userRecord } = await adminClient
    .from("users")
    .select("email, full_name")
    .eq("id", residentUserId)
    .maybeSingle();

  if (userRecord?.email) {
    try {
      const appUrl = await getAppOrigin();
      await sendApplicationEmail({
        to: userRecord.email,
        fullName: userRecord.full_name || userRecord.email,
        appUrl,
      });
    } catch {
      // Email failure shouldn't block the action
    }
  }

  await sendNotification({
    userId: residentUserId,
    type: "application_required",
    title: "Application Required",
    message:
      "You need to complete the intake application. Please log in and follow the prompts.",
    entityType: "resident",
    entityId: residentId,
  });

  await logActivity({
    houseId: resident.house_id,
    residentId,
    actorId: currentUser.id,
    eventType: "application_resent",
    entityType: "resident",
    entityId: residentId,
    description: `Intake application resent to ${resident.full_name} by ${currentUser.full_name}`,
  });

  revalidatePath(`/residents/${residentId}`);
  revalidatePath("/residents");
  return okVoid();
}

// ── Admin sign-off on a resent application ──
// Clears the application_resent flag. No commitment changes needed
// because this is just a redo of the intake form, not a full re-intake.

export async function signOffResendApplication(
  userId: string,
  signoffData: {
    signature: string;
    printedName: string;
    date: string;
    pdfBase64: string;
  }
) {
  const currentUser = await requireAuth();
  if (currentUser.role !== "admin") {
    return err("Only admins can sign off on resent applications");
  }

  const adminClient = createAdminClient();

  const { data: userRow } = await adminClient
    .from("users")
    .select("id, full_name, application_resent")
    .eq("id", userId)
    .maybeSingle();

  if (!userRow) return err("User not found");
  if (!userRow.application_resent) {
    return err("No pending resent application for this user");
  }

  // Scope check: only sign off on a user in the admin's own tenant —
  // either a resident in an accessible house or an active member of
  // the admin's workspace.
  const { data: targetResident } = await adminClient
    .from("residents")
    .select("house_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (targetResident) {
    if (!canAccessHouse(currentUser, targetResident.house_id)) {
      return err("Not authorized");
    }
  } else {
    const { data: member } = await adminClient
      .from("workspace_members")
      .select("id")
      .eq("user_id", userId)
      .eq("workspace_id", currentUser.workspace_id ?? "")
      .eq("status", "active")
      .maybeSingle();
    if (!member) return err("Not authorized");
  }

  // Store the staff signature on the intake form
  const { data: intakeForm } = await adminClient
    .from("intake_forms")
    .select("id, form_data, signatures")
    .eq("user_id", userId)
    .maybeSingle();

  if (intakeForm) {
    const existingSignatures =
      (intakeForm.signatures as Record<string, string>) ?? {};
    const existingFormData =
      (intakeForm.form_data as Record<string, unknown>) ?? {};

    // Fill staff/witness slots (mirrors submitStaffSignoff logic)
    existingFormData.staff_signed_off_at = new Date().toISOString();
    existingFormData.application_staff_name = signoffData.printedName;
    existingFormData.application_staff_date = signoffData.date;
    existingSignatures.application_staff = signoffData.signature;

    const witnessKeys = [
      "house_rules_policy_witness",
      "good_neighbor_policy_witness",
      "confidentiality_policy_witness",
      "discharge_policy_witness",
    ];
    for (const k of witnessKeys) {
      existingSignatures[k] = signoffData.signature;
      existingFormData[`${k}_date`] = signoffData.date;
    }
    existingSignatures.release_of_information_witness = signoffData.signature;
    existingFormData.roi_witness_printed_name = signoffData.printedName;
    existingFormData.roi_witness_date = signoffData.date;

    await adminClient
      .from("intake_forms")
      .update({
        signatures: existingSignatures,
        form_data: existingFormData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", intakeForm.id);
  }

  // Replace the intake packet PDF in storage with the signed version
  const { data: existingDoc } = await adminClient
    .from("documents")
    .select("id, storage_path")
    .eq("user_id", userId)
    .eq("document_type", "intake_packet")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pdfBuffer = Buffer.from(signoffData.pdfBase64, "base64");
  const fileName =
    existingDoc?.storage_path ??
    `${userId}/intake-packet-${Date.now()}.pdf`;

  const { error: uploadErr } = await adminClient.storage
    .from("documents")
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    return err(`Could not upload signed packet: ${uploadErr.message}`);
  }

  if (existingDoc) {
    await adminClient
      .from("documents")
      .update({
        file_size: pdfBuffer.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingDoc.id);
  } else {
    await adminClient.from("documents").insert({
      user_id: userId,
      name: "Intake Packet",
      document_type: "intake_packet",
      storage_path: fileName,
      file_size: pdfBuffer.length,
    });
  }

  await adminClient
    .from("users")
    .update({ application_resent: false, updated_at: new Date().toISOString() })
    .eq("id", userId);

  await logActivity({
    actorId: currentUser.id,
    eventType: "resent_application_signed_off",
    entityType: "user",
    entityId: userId,
    description: `${currentUser.full_name} signed off on resent application for ${userRow.full_name}`,
  });

  revalidatePath("/residents");
  return okVoid();
}

