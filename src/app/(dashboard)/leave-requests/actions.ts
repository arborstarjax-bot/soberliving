"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { sendNotification, sendNotificationToHouseManagers, sendNotificationToAdmins, notifyHouseStaff } from "@/lib/notifications";
import { z } from "zod";
import { getHouseToday } from "@/lib/timezone";

const DATETIME_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

const createLeaveRequestSchema = z.object({
  resident_id: z.string().uuid(),
  covering_resident_id: z.string().uuid("You must select a covering resident from your house"),
  // Leaving / returning are the only date inputs the user fills out now.
  // The date-only `departure_date` / `expected_return_date` columns on the
  // DB are still populated, but we derive them from these datetimes so
  // existing list views and activity descriptions keep rendering.
  leaving_datetime: z
    .string()
    .regex(DATETIME_LOCAL_REGEX, "Leaving date/time is required"),
  returning_datetime: z
    .string()
    .regex(DATETIME_LOCAL_REGEX, "Returning date/time is required"),
  reason: z.string().optional(),
  reason_for_pass: z.string().optional(),
  transportation: z.string().optional(),
  companion: z.string().optional(),
  destination_address: z.string().optional(),
});

export async function createLeaveRequest(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const parsed = createLeaveRequestSchema.safeParse({
    resident_id: formData.get("resident_id"),
    covering_resident_id: formData.get("covering_resident_id"),
    leaving_datetime: formData.get("leaving_datetime"),
    returning_datetime: formData.get("returning_datetime"),
    reason: formData.get("reason") || undefined,
    reason_for_pass: formData.get("reason_for_pass") || undefined,
    transportation: formData.get("transportation") || undefined,
    companion: formData.get("companion") || undefined,
    destination_address: formData.get("destination_address") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // Get requesting resident
  const { data: resident } = await supabase
    .from("residents")
    .select("house_id, full_name")
    .eq("id", parsed.data.resident_id)
    .maybeSingle();

  if (!resident) return { error: "Resident not found" };

  // Verify covering resident is in the same house
  const { data: coverResident } = await supabase
    .from("residents")
    .select("house_id, full_name, user_id")
    .eq("id", parsed.data.covering_resident_id)
    .maybeSingle();

  if (!coverResident) return { error: "Covering resident not found" };
  if (coverResident.house_id !== resident.house_id) {
    return { error: "Covering resident must be from the same house" };
  }
  if (parsed.data.covering_resident_id === parsed.data.resident_id) {
    return { error: "You cannot select yourself as the covering resident" };
  }

  // Authorization
  if (user.role === "resident") {
    // Residents can only create requests for themselves
    const { data: myResident } = await supabase
      .from("residents")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!myResident || myResident.id !== parsed.data.resident_id) {
      return { error: "Not authorized" };
    }
  } else if (user.role !== "admin" && !canAccessHouse(user, resident.house_id)) {
    return { error: "Not authorized" };
  }

  // Derive the date-only columns from the datetimes so the rest of the
  // app (list views, activity log, notifications) keeps working without
  // schema changes. `datetime-local` inputs arrive as "YYYY-MM-DDTHH:MM"
  // so slicing the first 10 chars gives the YYYY-MM-DD we want.
  const departureDate = parsed.data.leaving_datetime.slice(0, 10);
  const expectedReturnDate = parsed.data.returning_datetime.slice(0, 10);

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      resident_id: parsed.data.resident_id,
      covering_resident_id: parsed.data.covering_resident_id,
      requested_by: user.id,
      departure_date: departureDate,
      expected_return_date: expectedReturnDate,
      reason: parsed.data.reason ?? null,
      reason_for_pass: parsed.data.reason_for_pass ?? null,
      leaving_datetime: parsed.data.leaving_datetime,
      returning_datetime: parsed.data.returning_datetime,
      transportation: parsed.data.transportation ?? null,
      companion: parsed.data.companion ?? null,
      destination_address: parsed.data.destination_address ?? null,
      status: "pending_cover",
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
    description: `Leave requested for ${resident.full_name}: ${departureDate} to ${expectedReturnDate}. Cover: ${coverResident.full_name}`,
  });

  // Notify covering resident
  if (coverResident.user_id) {
    await sendNotification({
      userId: coverResident.user_id,
      type: "cover_request",
      title: "Chore Cover Request",
      message: `${resident.full_name} wants you to cover their chores from ${departureDate} to ${expectedReturnDate}`,
      actionUrl: "/leave-requests",
      entityType: "leave_request",
      entityId: data.id,
    });
  }

  // Notify admins + managers of this house that a new leave request was
  // submitted. Manager approval still requires the covering resident to
  // accept first, but staff get visibility from the moment it's created.
  // Skip the requesting user in case they're also staff.
  await notifyHouseStaff(
    resident.house_id,
    {
      type: "leave_requested",
      title: "New Leave Request",
      message: `${resident.full_name} requested leave from ${departureDate} to ${expectedReturnDate}.`,
      actionUrl: "/leave-requests",
      entityType: "leave_request",
      entityId: data.id,
    },
    { excludeUserId: user.id }
  );

  revalidatePath("/leave-requests");
  return {};
}

export async function approveCoverRequest(requestId: string) {
  const user = await requireAuth();
  // RLS on leave_requests only lets the requester or staff read/update
  // rows — the covering resident is neither, so we use the admin client
  // and do the permission check ourselves.
  const adminClient = createAdminClient();

  const { data: request } = await adminClient
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id), covering_resident:residents!leave_requests_covering_resident_id_fkey(user_id, full_name)")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "Request not found" };
  if (request.status !== "pending_cover") return { error: "Request is not pending cover approval" };

  const resident = request.resident as unknown as { full_name: string; house_id: string } | null;
  const houseId = resident?.house_id ?? "";

  // Verify the current user is the covering resident, or authorized staff
  const coverResident = request.covering_resident as unknown as { user_id: string; full_name: string } | null;
  if (user.role === "resident" && coverResident?.user_id !== user.id) {
    return { error: "Only the covering resident can approve this" };
  }
  if (user.role !== "resident" && user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized for this house" };
  }

  const { error } = await adminClient
    .from("leave_requests")
    .update({
      status: "pending_manager",
      cover_approved_at: new Date().toISOString(),
      cover_approved_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    residentId: request.resident_id,
    actorId: user.id,
    eventType: "leave_cover_approved",
    entityType: "leave_request",
    entityId: requestId,
    description: `Cover approved by ${user.full_name} for ${resident?.full_name}'s leave request`,
  });

  // Notify house managers
  await sendNotificationToHouseManagers(houseId, {
    type: "manager_approval",
    title: "Leave Request Needs Approval",
    message: `${resident?.full_name}'s leave request has been approved by the covering resident. Please review.`,
    actionUrl: "/leave-requests",
    entityType: "leave_request",
    entityId: requestId,
  });

  revalidatePath("/leave-requests");
  return {};
}

export async function denyCoverRequest(requestId: string, note?: string) {
  const user = await requireAuth();
  // Mirror approveCoverRequest: RLS on leave_requests only permits the
  // requester or staff to read/update rows — the covering resident is
  // neither, so use the admin client and enforce permission in code.
  const adminClient = createAdminClient();

  const { data: request } = await adminClient
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id, user_id), covering_resident:residents!leave_requests_covering_resident_id_fkey(user_id)")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "Request not found" };
  if (request.status !== "pending_cover") return { error: "Request is not pending cover approval" };

  const residentInfo = request.resident as unknown as { full_name: string; house_id: string; user_id: string | null } | null;
  const houseId = residentInfo?.house_id ?? "";

  // Verify the current user is the covering resident, or authorized staff
  const coverResident = request.covering_resident as unknown as { user_id: string } | null;
  if (user.role === "resident" && coverResident?.user_id !== user.id) {
    return { error: "Only the covering resident can deny this" };
  }
  if (user.role !== "resident" && user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized for this house" };
  }

  const { error } = await adminClient
    .from("leave_requests")
    .update({
      status: "rejected",
      rejection_step: "cover",
      denial_note: note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: residentInfo?.house_id,
    residentId: request.resident_id,
    actorId: user.id,
    eventType: "leave_cover_denied",
    entityType: "leave_request",
    entityId: requestId,
    description: `Cover denied by ${user.full_name} for ${residentInfo?.full_name}'s leave request`,
  });

  // Notify the requesting resident
  if (residentInfo?.user_id) {
    await sendNotification({
      userId: residentInfo.user_id,
      type: "leave_rejected",
      title: "Leave Request Denied",
      message: `Your covering resident declined your leave request${note ? `: ${note}` : ""}`,
      actionUrl: "/leave-requests",
      entityType: "leave_request",
      entityId: requestId,
    });
  }

  revalidatePath("/leave-requests");
  return {};
}

export async function approveManagerRequest(requestId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id)")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "Request not found" };
  if (request.status !== "pending_manager") return { error: "Request is not pending manager approval" };

  const resident = request.resident as unknown as { full_name: string; house_id: string } | null;
  const houseId = resident?.house_id ?? "";

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized for this house" };
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "pending_admin",
      house_manager_approved_at: new Date().toISOString(),
      house_manager_approved_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    residentId: request.resident_id,
    actorId: user.id,
    eventType: "leave_manager_approved",
    entityType: "leave_request",
    entityId: requestId,
    description: `Leave request approved by manager ${user.full_name} for ${resident?.full_name}`,
  });

  // Notify admins
  await sendNotificationToAdmins({
    type: "admin_approval",
    title: "Leave Request Final Approval",
    message: `${resident?.full_name}'s leave request has been approved by the house manager. Final approval needed.`,
    actionUrl: "/leave-requests",
    entityType: "leave_request",
    entityId: requestId,
  });

  revalidatePath("/leave-requests");
  return {};
}

export async function denyManagerRequest(requestId: string, note?: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id, user_id)")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "Request not found" };
  if (request.status !== "pending_manager") return { error: "Request is not pending manager approval" };

  const resident = request.resident as unknown as { full_name: string; house_id: string; user_id: string | null } | null;
  const houseId = resident?.house_id ?? "";

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized for this house" };
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "rejected",
      rejection_step: "manager",
      denial_note: note ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    residentId: request.resident_id,
    actorId: user.id,
    eventType: "leave_manager_denied",
    entityType: "leave_request",
    entityId: requestId,
    description: `Leave request denied by manager ${user.full_name} for ${resident?.full_name}`,
  });

  if (resident?.user_id) {
    await sendNotification({
      userId: resident.user_id,
      type: "leave_rejected",
      title: "Leave Request Denied by Manager",
      message: `Your leave request was denied by the house manager${note ? `: ${note}` : ""}`,
      actionUrl: "/leave-requests",
      entityType: "leave_request",
      entityId: requestId,
    });
  }

  revalidatePath("/leave-requests");
  return {};
}

export async function approveAdminRequest(requestId: string) {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Not authorized — only admins can give final approval" };

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id, user_id)")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "Request not found" };
  // Admin trumps manager: allow final approval at either the manager or
  // admin stage. If the admin is short-circuiting the manager step, we
  // still stamp the manager_approved_at fields to the admin so the
  // approval timeline reads sanely.
  if (request.status !== "pending_admin" && request.status !== "pending_manager") {
    return { error: "Request cannot be approved from its current status" };
  }

  const nowIso = new Date().toISOString();
  const skippedManager = request.status === "pending_manager";

  const updates: Record<string, unknown> = {
    status: "approved",
    admin_approved_at: nowIso,
    admin_approved_by: user.id,
    reviewed_by: user.id,
    reviewed_at: nowIso,
    updated_at: nowIso,
  };
  if (skippedManager) {
    updates.house_manager_approved_at = nowIso;
    updates.house_manager_approved_by = user.id;
  }

  const { error } = await supabase
    .from("leave_requests")
    .update(updates)
    .eq("id", requestId);

  if (error) return { error: error.message };

  const resident = request.resident as unknown as { full_name: string; house_id: string; user_id: string | null } | null;

  await logActivity({
    houseId: resident?.house_id,
    residentId: request.resident_id,
    actorId: user.id,
    eventType: "leave_approved",
    entityType: "leave_request",
    entityId: requestId,
    description:
      `Leave request final approval by admin ${user.full_name} for ${resident?.full_name}` +
      (skippedManager ? " (skipped manager review)" : ""),
  });

  if (resident?.user_id) {
    await sendNotification({
      userId: resident.user_id,
      type: "leave_approved",
      title: "Leave Request Approved!",
      message: `Your leave request has been fully approved.`,
      actionUrl: "/leave-requests",
      entityType: "leave_request",
      entityId: requestId,
    });
  }

  revalidatePath("/leave-requests");
  return {};
}

export async function denyAdminRequest(requestId: string, note?: string) {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Not authorized — only admins can deny at final approval" };

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id, user_id)")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "Request not found" };
  // Mirror the admin-trumps-manager approval path: admins can deny at
  // either the manager or admin stage.
  if (request.status !== "pending_admin" && request.status !== "pending_manager") {
    return { error: "Request cannot be denied from its current status" };
  }

  const resident = request.resident as unknown as { full_name: string; house_id: string; user_id: string | null } | null;

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "rejected",
      rejection_step: "admin",
      denial_note: note ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  await logActivity({
    houseId: resident?.house_id,
    residentId: request.resident_id,
    actorId: user.id,
    eventType: "leave_admin_denied",
    entityType: "leave_request",
    entityId: requestId,
    description: `Leave request denied by admin ${user.full_name} for ${resident?.full_name}`,
  });

  if (resident?.user_id) {
    await sendNotification({
      userId: resident.user_id,
      type: "leave_rejected",
      title: "Leave Request Denied by Admin",
      message: `Your leave request was denied at final review${note ? `: ${note}` : ""}`,
      actionUrl: "/leave-requests",
      entityType: "leave_request",
      entityId: requestId,
    });
  }

  revalidatePath("/leave-requests");
  return {};
}

export async function markLeaveReturned(requestId: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("leave_requests")
    .select("status, resident_id, resident:residents!leave_requests_resident_id_fkey(full_name, house_id)")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "Request not found" };

  // Only approved requests can be marked as returned
  const requestStatus = (request as unknown as { status: string }).status;
  if (requestStatus !== "approved") return { error: "Only approved requests can be marked as returned" };

  const resident = request.resident as unknown as { full_name: string; house_id: string } | null;
  const houseId = resident?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "returned",
      actual_return_date: getHouseToday(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  await logActivity({
    houseId,
    residentId: request.resident_id,
    actorId: user.id,
    eventType: "leave_returned",
    entityType: "leave_request",
    entityId: requestId,
    description: `${resident?.full_name} returned from leave`,
  });

  revalidatePath("/leave-requests");
  return {};
}
