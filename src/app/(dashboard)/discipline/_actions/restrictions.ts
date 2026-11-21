"use server";
import { err, okVoid, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { getHouseToday } from "@/lib/timezone";
import { getHouseTimezone } from "@/lib/workspace";
import { sendNotification } from "@/lib/notifications";


export async function createRestriction(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return err("Not authorized");

  const residentId = formData.get("resident_id") as string;
  const houseId = formData.get("house_id") as string;
  const restrictionType = formData.get("restriction_type") as string;
  const description = formData.get("description") as string;
  const notes = formData.get("notes") as string | null;
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string | null;
  const isHouseCommitment = formData.get("is_house_commitment") === "on";

  if (!residentId || !houseId || !description) {
    return err("Resident, house, and description are required");
  }

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return err("Not authorized");
  }

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("full_name")
    .eq("id", residentId)
    .single();

  const { data, error } = await supabase
    .from("restrictions")
    .insert({
      resident_id: residentId,
      house_id: houseId,
      restriction_type: restrictionType || "custom",
      description,
      notes: notes || null,
      start_date: startDate || getHouseToday(await getHouseTimezone(houseId)),
      end_date: endDate || null,
      is_house_commitment: isHouseCommitment,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return err(error.message);

  await logActivity({
    houseId,
    residentId,
    actorId: user.id,
    eventType: "restriction_created",
    entityType: "restriction",
    entityId: data.id,
    description: `Restriction added for ${resident?.full_name} by ${user.full_name}: ${description}`,
    metadata: { restriction_type: restrictionType, is_house_commitment: isHouseCommitment },
  });

  const { data: residentUser } = await supabase
    .from("residents")
    .select("user_id")
    .eq("id", residentId)
    .single();

  if (residentUser?.user_id) {
    await sendNotification({
      userId: residentUser.user_id,
      type: "restriction_created",
      title: isHouseCommitment ? "House Commitment Added" : "Restriction Added",
      message: description,
      actionUrl: "/discipline",
      entityType: "restriction",
      entityId: data.id,
    });
  }

  revalidatePath("/discipline");
  revalidatePath(`/residents/${residentId}`);
  revalidatePath("/dashboard");
  return okVoid();
}

export async function liftRestriction(restrictionId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return err("Not authorized");

  const supabase = await createClient();

  const { data: restriction } = await supabase
    .from("restrictions")
    .select("house_id, resident_id, description")
    .eq("id", restrictionId)
    .single();

  if (!restriction) return err("Restriction not found");
  if (user.role !== "admin" && !canAccessHouse(user, restriction.house_id)) {
    return err("Not authorized");
  }

  const { error } = await supabase
    .from("restrictions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", restrictionId);

  if (error) return err(error.message);

  await logActivity({
    houseId: restriction.house_id,
    residentId: restriction.resident_id,
    actorId: user.id,
    eventType: "restriction_lifted",
    entityType: "restriction",
    entityId: restrictionId,
    description: `Restriction lifted by ${user.full_name}: ${restriction.description}`,
  });

  const { data: residentUser } = await supabase
    .from("residents")
    .select("user_id")
    .eq("id", restriction.resident_id)
    .single();

  if (residentUser?.user_id) {
    await sendNotification({
      userId: residentUser.user_id,
      type: "restriction_lifted",
      title: "Restriction Lifted",
      message: restriction.description,
      actionUrl: "/discipline",
      entityType: "restriction",
      entityId: restrictionId,
    });
  }

  revalidatePath("/discipline");
  revalidatePath(`/residents/${restriction.resident_id}`);
  revalidatePath("/dashboard");
  return okVoid();
}

export async function deleteRestriction(restrictionId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return err("Not authorized");

  const supabase = await createClient();

  const { data: restriction } = await supabase
    .from("restrictions")
    .select("house_id, resident_id, description")
    .eq("id", restrictionId)
    .single();

  if (!restriction) return err("Restriction not found");
  if (user.role !== "admin" && !canAccessHouse(user, restriction.house_id)) {
    return err("Not authorized");
  }

  const { error } = await supabase
    .from("restrictions")
    .delete()
    .eq("id", restrictionId);

  if (error) return err(error.message);

  await logActivity({
    houseId: restriction.house_id,
    residentId: restriction.resident_id,
    actorId: user.id,
    eventType: "restriction_deleted",
    entityType: "restriction",
    entityId: restrictionId,
    description: `Restriction deleted by ${user.full_name}: ${restriction.description}`,
  });

  revalidatePath("/discipline");
  revalidatePath(`/residents/${restriction.resident_id}`);
  revalidatePath("/dashboard");
  return okVoid();
}

// Edit an existing restriction's type / description / dates / notes.
// Admin / manager only. Logs an "restriction_updated" activity entry
// so the audit trail captures every field change.

export async function updateRestriction(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  if (user.role === "resident") return err("Not authorized");

  const restrictionId = formData.get("restriction_id") as string;
  const restrictionType = formData.get("restriction_type") as string;
  const description = formData.get("description") as string;
  const notes = formData.get("notes") as string | null;
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string | null;

  if (!restrictionId || !description || !restrictionType) {
    return err("Restriction id, type, and description are required");
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("restrictions")
    .select("house_id, resident_id, description, restriction_type")
    .eq("id", restrictionId)
    .single();

  if (!existing) return err("Restriction not found");
  if (user.role !== "admin" && !canAccessHouse(user, existing.house_id)) {
    return err("Not authorized");
  }

  const { error } = await supabase
    .from("restrictions")
    .update({
      restriction_type: restrictionType,
      description,
      notes: notes || null,
      start_date: startDate || getHouseToday(await getHouseTimezone(existing.house_id)),
      end_date: endDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", restrictionId);

  if (error) return err(error.message);

  await logActivity({
    houseId: existing.house_id,
    residentId: existing.resident_id,
    actorId: user.id,
    eventType: "restriction_updated",
    entityType: "restriction",
    entityId: restrictionId,
    description: `Restriction updated by ${user.full_name}: ${description}`,
    metadata: {
      previous_type: existing.restriction_type,
      new_type: restrictionType,
    },
  });

  revalidatePath("/discipline");
  revalidatePath(`/residents/${existing.resident_id}`);
  revalidatePath("/dashboard");
  return okVoid();
}

