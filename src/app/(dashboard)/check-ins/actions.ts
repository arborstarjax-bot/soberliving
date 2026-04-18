"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { getHouseToday } from "@/lib/timezone";

/**
 * Send a check-in to one or more houses.
 * Creates a batch record and one pending response per active resident.
 */
export async function sendCheckIn(houseIds: string[]) {
  const user = await requireAuth();

  if (user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }

  if (houseIds.length === 0) {
    return { error: "Please select at least one house" };
  }

  // Managers can only send to their assigned houses
  if (user.role === "manager") {
    for (const houseId of houseIds) {
      if (!canAccessHouse(user, houseId)) {
        return { error: "You can only send check-ins to houses you manage" };
      }
    }
  }

  const adminClient = createAdminClient();

  // Create the batch
  const { data: batch, error: batchError } = await adminClient
    .from("check_in_batches")
    .insert({
      created_by: user.id,
      house_ids: houseIds,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    return { error: batchError?.message ?? "Failed to create check-in batch" };
  }

  // Get all active residents in the selected houses
  const { data: residents, error: residentsError } = await adminClient
    .from("residents")
    .select("id, user_id, house_id")
    .in("house_id", houseIds)
    .eq("status", "active")
    .not("user_id", "is", null);

  if (residentsError) {
    return { error: residentsError.message };
  }

  if (!residents || residents.length === 0) {
    return { error: "No active residents found in the selected houses" };
  }

  // Create one pending response per resident
  const responses = residents.map((r) => ({
    batch_id: batch.id,
    resident_id: r.id,
    user_id: r.user_id!,
    house_id: r.house_id,
    status: "pending",
  }));

  const { error: insertError } = await adminClient
    .from("check_in_responses")
    .insert(responses);

  if (insertError) {
    return { error: insertError.message };
  }

  // Log activity for each house
  for (const houseId of houseIds) {
    const houseResidentCount = residents.filter((r) => r.house_id === houseId).length;
    await logActivity({
      actorId: user.id,
      houseId,
      eventType: "check_in_sent",
      entityType: "check_in_batch",
      entityId: batch.id,
      description: `${user.full_name} sent monthly check-in to ${houseResidentCount} resident(s)`,
    });
  }

  revalidatePath("/residents");
  return { batchId: batch.id, count: residents.length };
}

/**
 * Submit a completed check-in form (called by residents).
 */
export async function submitCheckIn(
  responseId: string,
  formData: Record<string, unknown>,
  pdfBase64: string
) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  // Verify this check-in belongs to the user and is still pending
  const { data: response, error: fetchError } = await adminClient
    .from("check_in_responses")
    .select("id, user_id, resident_id, house_id, status")
    .eq("id", responseId)
    .single();

  if (fetchError || !response) {
    return { error: "Check-in not found" };
  }

  if (response.user_id !== user.id) {
    return { error: "Not authorized" };
  }

  if (response.status !== "pending") {
    return { error: "This check-in has already been completed" };
  }

  // Upload PDF to Supabase Storage
  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  const dateStr = getHouseToday();
  const fileName = `${user.id}/check-in-${dateStr}-${Date.now()}.pdf`;

  const { error: uploadError } = await adminClient.storage
    .from("documents")
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    console.error("Check-in PDF upload failed:", uploadError.message);
  }

  // Create document record
  if (!uploadError) {
    await adminClient.from("documents").insert({
      user_id: user.id,
      name: `Check In - ${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", year: "numeric" })}`,
      document_type: "check_in",
      storage_path: fileName,
      file_size: pdfBuffer.length,
    });
  }

  // Update the response
  const { error: updateError } = await adminClient
    .from("check_in_responses")
    .update({
      status: "completed",
      form_data: formData,
      completed_at: new Date().toISOString(),
      pdf_storage_path: uploadError ? null : fileName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", responseId);

  if (updateError) {
    return { error: updateError.message };
  }

  await logActivity({
    actorId: user.id,
    residentId: response.resident_id,
    houseId: response.house_id,
    eventType: "check_in_completed",
    entityType: "check_in_response",
    entityId: responseId,
    description: `${user.full_name} completed monthly check-in`,
  });

  revalidatePath("/residents");
  revalidatePath("/dashboard");
  return {};
}


/**
 * Get check-in batches for the Check Ins admin tab.
 */
export async function getCheckInBatches() {
  const user = await requireAuth();

  if (user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized", batches: [] };
  }

  const adminClient = createAdminClient();

  const { data: batches, error } = await adminClient
    .from("check_in_batches")
    .select("id, created_by, house_ids, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return { error: error.message, batches: [] };
  }

  // For each batch, get response counts
  const batchIds = (batches ?? []).map((b) => b.id);

  if (batchIds.length === 0) {
    return { batches: [] };
  }

  const { data: responses } = await adminClient
    .from("check_in_responses")
    .select("id, batch_id, status, resident_id, house_id, completed_at, form_data, resident:residents!check_in_responses_resident_id_fkey(full_name)")
    .in("batch_id", batchIds);

  // Get creator names
  const creatorIds = [...new Set((batches ?? []).map((b) => b.created_by))];
  const { data: creators } = await adminClient
    .from("users")
    .select("id, full_name")
    .in("id", creatorIds);

  const creatorMap = new Map((creators ?? []).map((c) => [c.id, c.full_name]));

  // Get house names
  const allHouseIds = [...new Set((batches ?? []).flatMap((b) => b.house_ids))];
  const { data: houses } = await adminClient
    .from("houses")
    .select("id, name")
    .in("id", allHouseIds);

  const houseMap = new Map((houses ?? []).map((h) => [h.id, h.name]));

  const enrichedBatches = (batches ?? []).map((b) => {
    const batchResponses = (responses ?? []).filter((r) => r.batch_id === b.id);
    const completed = batchResponses.filter((r) => r.status === "completed").length;
    const total = batchResponses.length;
    const houseNames = b.house_ids.map((hid: string) => houseMap.get(hid) ?? "Unknown").join(", ");

    return {
      id: b.id,
      createdBy: creatorMap.get(b.created_by) ?? "Unknown",
      houseNames,
      houseIds: b.house_ids as string[],
      createdAt: b.created_at,
      completedCount: completed,
      totalCount: total,
      responses: batchResponses.map((r) => ({
        id: r.id,
        residentName: (r.resident as unknown as { full_name: string })?.full_name ?? "Unknown",
        status: r.status as string,
        completedAt: r.completed_at as string | null,
        formData: r.form_data as Record<string, unknown> | null,
        houseId: r.house_id as string,
      })),
    };
  });

  // Filter for managers: only show batches that include their houses
  if (user.role === "manager") {
    const filtered = enrichedBatches.filter((b) =>
      b.houseIds.some((hid) => user.assigned_house_ids.includes(hid))
    );
    return { batches: filtered };
  }

  return { batches: enrichedBatches };
}

/**
 * Get a single check-in response for the resident form.
 */
export async function getCheckInResponse(responseId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("check_in_responses")
    .select("id, user_id, resident_id, house_id, status, form_data, created_at, resident:residents!check_in_responses_resident_id_fkey(full_name, house_id, houses(name))")
    .eq("id", responseId)
    .single();

  if (error || !data) {
    return { error: "Check-in not found" };
  }

  // The user filling out the form must own this check-in
  if (data.user_id !== user.id && user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }

  // Managers can only see their houses
  if (user.role === "manager" && !canAccessHouse(user, data.house_id)) {
    return { error: "Not authorized" };
  }

  const resident = data.resident as unknown as {
    full_name: string;
    house_id: string;
    houses: { name: string } | null;
  };

  return {
    response: {
      id: data.id,
      userId: data.user_id,
      residentId: data.resident_id,
      houseId: data.house_id,
      status: data.status as string,
      formData: data.form_data as Record<string, unknown> | null,
      createdAt: data.created_at,
      residentName: resident?.full_name ?? "Unknown",
      houseName: resident?.houses?.name ?? "Unknown",
    },
  };
}
