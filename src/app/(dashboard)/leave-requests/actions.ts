"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { createLeaveRequestSchema } from "@/lib/validations";

export async function createLeaveRequest(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createLeaveRequestSchema.safeParse({
    resident_id: formData.get("resident_id"),
    departure_date: formData.get("departure_date"),
    expected_return_date: formData.get("expected_return_date"),
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", parsed.data.resident_id)
    .single();

  if (!resident) return { error: "Resident not found" };

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      ...parsed.data,
      requested_by: user.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    houseId: resident.house_id,
    residentId: parsed.data.resident_id,
    actorId: user.id,
    eventType: "leave_requested",
    entityType: "leave_request",
    entityId: data.id,
    description: `Leave requested for ${resident.full_name}: ${parsed.data.departure_date} to ${parsed.data.expected_return_date}`,
  });

  revalidatePath("/leave-requests");
  revalidatePath(`/residents/${parsed.data.resident_id}`);
  return {};
}

export async function reviewLeaveRequest(
  requestId: string,
  action: "approve" | "deny",
  denialNote?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("leave_requests")
    .select("resident_id, resident:residents(full_name, house_id)")
    .eq("id", requestId)
    .single();

  if (!request) return { error: "Request not found" };

  const houseId = (request.resident as unknown as { house_id: string } | null)?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const updateData: Record<string, unknown> = {
    status: action === "approve" ? "approved" : "denied",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (action === "deny" && denialNote) {
    updateData.denial_note = denialNote;
  }

  const { error } = await supabase
    .from("leave_requests")
    .update(updateData)
    .eq("id", requestId);

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    residentId: request.resident_id,
    actorId: user.id,
    eventType: action === "approve" ? "leave_approved" : "leave_denied",
    entityType: "leave_request",
    entityId: requestId,
    description: `Leave ${action}d for ${(request.resident as unknown as { full_name: string } | null)?.full_name} by ${user.full_name}`,
  });

  revalidatePath("/leave-requests");
  revalidatePath(`/residents/${request.resident_id}`);
  return {};
}

export async function markLeaveReturned(requestId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("leave_requests")
    .select("resident_id, resident:residents(full_name, house_id)")
    .eq("id", requestId)
    .single();

  if (!request) return { error: "Request not found" };

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "returned",
      actual_return_date: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  const houseId = (request.resident as unknown as { house_id: string } | null)?.house_id ?? "";

  await logActivity({
    houseId,
    residentId: request.resident_id,
    actorId: user.id,
    eventType: "leave_returned",
    entityType: "leave_request",
    entityId: requestId,
    description: `${(request.resident as unknown as { full_name: string } | null)?.full_name} returned from leave`,
  });

  revalidatePath("/leave-requests");
  revalidatePath(`/residents/${request.resident_id}`);
  return {};
}
