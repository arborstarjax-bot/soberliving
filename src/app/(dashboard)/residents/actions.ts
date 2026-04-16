"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import {
  createResidentSchema,
  updateResidentSchema,
  createNoteSchema,
} from "@/lib/validations";

// --- Residents ---

export async function createResident(
  _prevState: { error?: string } | undefined,
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
    return { error: parsed.error.issues[0].message };
  }

  if (
    user.role !== "admin" &&
    !canAccessHouse(user, parsed.data.house_id)
  ) {
    return { error: "Not authorized for this house" };
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

  if (error) return { error: error.message };

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
    .single();

  if (!resident) return { error: "Resident not found" };
  if (
    user.role !== "admin" &&
    !canAccessHouse(user, resident.house_id)
  ) {
    return { error: "Not authorized" };
  }

  // Use null for cleared fields (empty string) vs undefined for absent fields
  function fieldVal(key: string): string | null | undefined {
    if (!formData.has(key)) return undefined; // field absent — don't update
    const v = formData.get(key) as string;
    return v === "" ? null : v; // empty string — clear to null
  }

  const parsed = updateResidentSchema.safeParse({
    full_name: formData.get("full_name") || undefined, // name should never be cleared
    phone: fieldVal("phone"),
    email: fieldVal("email"),
    emergency_contact_name: fieldVal("emergency_contact_name"),
    emergency_contact_phone: fieldVal("emergency_contact_phone"),
    emergency_contact_relationship: fieldVal("emergency_contact_relationship"),
    sobriety_date: fieldVal("sobriety_date"),
    notes: fieldVal("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { error } = await supabase
    .from("residents")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", residentId);

  if (error) return { error: error.message };

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
  return {};
}

export async function dischargeResident(residentId: string, reason?: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", residentId)
    .single();

  if (!resident) return { error: "Resident not found" };
  if (
    user.role !== "admin" &&
    !canAccessHouse(user, resident.house_id)
  ) {
    return { error: "Not authorized" };
  }

  const dischargeDate = new Date().toISOString().split("T")[0];

  // End all active bed assignments
  await supabase
    .from("bed_assignments")
    .update({ end_date: dischargeDate })
    .eq("resident_id", residentId)
    .is("end_date", null);

  // Update resident status with discharge date and optional reason
  const { error } = await supabase
    .from("residents")
    .update({
      status: "discharged",
      move_out_date: dischargeDate,
      discharge_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", residentId);

  if (error) return { error: error.message };

  const reasonText = reason ? ` — Reason: ${reason}` : "";
  await logActivity({
    houseId: resident.house_id,
    residentId,
    actorId: user.id,
    eventType: "move_out",
    entityType: "resident",
    entityId: residentId,
    description: `${resident.full_name} discharged by ${user.full_name}${reasonText}`,
  });

  revalidatePath(`/residents/${residentId}`);
  revalidatePath(`/houses/${resident.house_id}`);
  revalidatePath("/residents");
  return {};
}

export async function deleteResident(residentId: string) {
  const user = await requireAuth();
  if (user.role !== "admin") {
    return { error: "Only admins can delete residents" };
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", residentId)
    .single();

  if (!resident) return { error: "Resident not found" };

  // End all active bed assignments
  await supabase
    .from("bed_assignments")
    .update({ end_date: new Date().toISOString().split("T")[0] })
    .eq("resident_id", residentId)
    .is("end_date", null);

  // Delete the resident
  const { error } = await supabase
    .from("residents")
    .delete()
    .eq("id", residentId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: resident.house_id,
    actorId: user.id,
    eventType: "resident_deleted",
    entityType: "resident",
    entityId: residentId,
    description: `${resident.full_name} deleted by ${user.full_name}`,
  });

  revalidatePath("/residents");
  revalidatePath(`/houses/${resident.house_id}`);
  return {};
}

// --- Force Photo Toggle ---

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
    .single();

  if (!resident) return { error: "Resident not found" };
  if (user.role !== "admin" && !canAccessHouse(user, resident.house_id)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("residents")
    .update({ force_photo: forcePhoto, updated_at: new Date().toISOString() })
    .eq("id", residentId);

  if (error) return { error: error.message };

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
  return {};
}

// --- Bed Assignments ---

export async function assignBed(
  residentId: string,
  bedId: string,
  houseId: string
) {
  const user = await requireAuth();

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();

  // Check bed is not already occupied
  const { data: existingAssignment } = await supabase
    .from("bed_assignments")
    .select("id")
    .eq("bed_id", bedId)
    .is("end_date", null)
    .single();

  if (existingAssignment) {
    return { error: "This bed is already occupied" };
  }

  // Check resident doesn't already have 2 active assignments
  const { data: residentAssignments } = await supabase
    .from("bed_assignments")
    .select("id")
    .eq("resident_id", residentId)
    .is("end_date", null);

  if (residentAssignments && residentAssignments.length >= 2) {
    return { error: "Resident already has 2 bed assignments (max for private room)" };
  }

  const { data, error } = await supabase
    .from("bed_assignments")
    .insert({
      resident_id: residentId,
      bed_id: bedId,
      start_date: new Date().toISOString().split("T")[0],
      assigned_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Get bed details for logging
  const { data: bed } = await supabase
    .from("beds")
    .select("label, room:rooms(name)")
    .eq("id", bedId)
    .single();

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name")
    .eq("id", residentId)
    .single();

  await logActivity({
    houseId,
    residentId,
    actorId: user.id,
    eventType: "bed_assigned",
    entityType: "bed_assignment",
    entityId: data.id,
    description: `${resident?.full_name} assigned to ${(bed?.room as unknown as { name: string } | null)?.name} / ${bed?.label} by ${user.full_name}`,
    metadata: { bed_id: bedId },
  });

  revalidatePath(`/houses/${houseId}`);
  revalidatePath(`/residents/${residentId}`);
  return {};
}

export async function vacateBed(assignmentId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("bed_assignments")
    .select("resident_id, bed_id, bed:beds(label, room:rooms(name, house_id))")
    .eq("id", assignmentId)
    .single();

  if (!assignment) return { error: "Assignment not found" };

  const houseId = (assignment.bed as unknown as { room: { house_id: string } } | null)?.room?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("bed_assignments")
    .update({ end_date: new Date().toISOString().split("T")[0] })
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    residentId: assignment.resident_id,
    actorId: user.id,
    eventType: "bed_vacated",
    entityType: "bed_assignment",
    entityId: assignmentId,
    description: `Bed vacated by ${user.full_name}`,
  });

  revalidatePath(`/houses/${houseId}`);
  revalidatePath(`/residents/${assignment.resident_id}`);
  return {};
}

// --- Notes ---

export async function createNote(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createNoteSchema.safeParse({
    resident_id: formData.get("resident_id"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", parsed.data.resident_id)
    .single();

  if (!resident) return { error: "Resident not found" };
  if (
    user.role !== "admin" &&
    !canAccessHouse(user, resident.house_id)
  ) {
    return { error: "Not authorized" };
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

  if (error) return { error: error.message };

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
  return {};
}
