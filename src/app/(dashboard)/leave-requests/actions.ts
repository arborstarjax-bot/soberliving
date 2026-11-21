"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { sendNotification, sendNotificationToHouseManagers, sendNotificationToAdmins, notifyHouseStaff } from "@/lib/notifications";
import { z } from "zod";
import { getHouseToday } from "@/lib/timezone";
import type { SupabaseClient } from "@supabase/supabase-js";

const DATETIME_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

// Who gives final approval on a pass for the house's workspace.
// Defaults to 'both' (manager → admin) when settings are missing.
async function getPassApprover(
  db: Pick<SupabaseClient, "from">,
  houseId: string
): Promise<"manager" | "admin" | "both"> {
  const { data: house } = await db
    .from("houses")
    .select("workspace_id")
    .eq("id", houseId)
    .maybeSingle();
  if (!house?.workspace_id) return "both";
  const { data: ws } = await db
    .from("workspace_settings")
    .select("pass_approver")
    .eq("workspace_id", house.workspace_id)
    .maybeSingle();
  const v = ws?.pass_approver;
  return v === "manager" || v === "admin" ? v : "both";
}

// Shapes returned by PostgREST joins. The select string is untyped for TS,
// so we narrow the joined rows here to avoid sprinkling `as unknown as`
// at every access site.
type ResidentJoin = {
  full_name: string;
  house_id: string;
  user_id: string | null;
};
type CoverResidentJoin = {
  user_id: string | null;
  full_name: string;
};
type LeaveRequestRow = {
  id: string;
  status: string;
  resident_id: string;
  resident: ResidentJoin | null;
  covering_resident: CoverResidentJoin | null;
};

const createLeaveRequestSchema = z.object({
  resident_id: z.string().uuid(),
  // Optional: a solo resident in a house has nobody to cover their
  // chores, so the request skips the cover step entirely.
  covering_resident_id: z
    .union([z.string().uuid(), z.literal("")])
    .optional(),
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

  const coveringResidentId = parsed.data.covering_resident_id || null;

  // Look up the other active residents in this house — needed both for
  // the cover checks and to know whether skipping the cover is allowed.
  // Resident-role RLS returns only the resident's own row, which would
  // make every shared house look solo and bypass cover approval — so
  // housemate lookups always go through the admin client.
  const adminDb = createAdminClient();
  const { data: otherHouseResidents } = await adminDb
    .from("residents")
    .select("id")
    .eq("house_id", resident.house_id)
    .eq("status", "active")
    .neq("id", parsed.data.resident_id);
  const soloInHouse = (otherHouseResidents ?? []).length === 0;

  let coverResident: {
    house_id: string;
    full_name: string;
    user_id: string | null;
  } | null = null;

  if (coveringResidentId) {
    // Verify covering resident is in the same house
    const { data: cover } = await adminDb
      .from("residents")
      .select("house_id, full_name, user_id")
      .eq("id", coveringResidentId)
      .maybeSingle();

    if (!cover) return { error: "Covering resident not found" };
    if (cover.house_id !== resident.house_id) {
      return { error: "Covering resident must be from the same house" };
    }
    if (coveringResidentId === parsed.data.resident_id) {
      return { error: "You cannot select yourself as the covering resident" };
    }
    coverResident = cover;

    // The covering resident must be free of their own chore duties in the
    // house's current rotation — they can't cover someone else's chores
    // while doing theirs. Only enforced when an eligible (chore-free)
    // resident exists, matching the picker; if everyone is busy we still
    // accept the request rather than blocking leave entirely.
    const { data: currentRotation } = await adminDb
      .from("chore_rotations")
      .select("id")
      .eq("house_id", resident.house_id)
      .eq("is_current", true)
      .maybeSingle();

    if (currentRotation) {
      const { data: rotationAssignments } = await adminDb
        .from("chore_rotation_assignments")
        .select("resident_id")
        .eq("rotation_id", currentRotation.id);
      const busyIds = new Set(
        (rotationAssignments ?? []).map((a) => a.resident_id)
      );
      const hasEligibleCover = (otherHouseResidents ?? []).some(
        (r) => !busyIds.has(r.id)
      );
      if (hasEligibleCover && busyIds.has(coveringResidentId)) {
        return {
          error:
            "That resident already has chore assignments this rotation — pick a resident who is free to cover",
        };
      }
    }
  } else if (!soloInHouse) {
    return {
      error: "You must select a covering resident from your house",
    };
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

  // Solo residents skip the cover step and land on the first staff
  // approver the workspace's pass-approver setting names.
  let initialStatus = "pending_cover";
  if (!coverResident) {
    const passApprover = await getPassApprover(supabase, resident.house_id);
    initialStatus =
      passApprover === "admin" ? "pending_admin" : "pending_manager";
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      resident_id: parsed.data.resident_id,
      covering_resident_id: coveringResidentId,
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
      status: initialStatus,
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
    description: `Leave requested for ${resident.full_name}: ${departureDate} to ${expectedReturnDate}.${coverResident ? ` Cover: ${coverResident.full_name}` : " No cover needed (solo resident)."}`,
  });

  // Notify covering resident
  if (coverResident?.user_id) {
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

  // Solo requests land straight on the first approver — make sure admins
  // are pinged when the workspace routes approvals to them only.
  if (initialStatus === "pending_admin") {
    await sendNotificationToAdmins({
      type: "admin_approval",
      title: "Leave Request Needs Approval",
      message: `${resident.full_name} requested leave from ${departureDate} to ${expectedReturnDate}. Please review.`,
      actionUrl: "/leave-requests",
      entityType: "leave_request",
      entityId: data.id,
    });
  }

  revalidatePath("/leave-requests");
  return {};
}

export async function approveCoverRequest(requestId: string) {
  const user = await requireAuth();
  // RLS on leave_requests only lets the requester or staff read/update
  // rows — the covering resident is neither, so we use the admin client
  // and do the permission check ourselves.
  const adminClient = createAdminClient();

  const { data: rawRequest } = await adminClient
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id), covering_resident:residents!leave_requests_covering_resident_id_fkey(user_id, full_name)")
    .eq("id", requestId)
    .maybeSingle();

  const request = rawRequest as unknown as LeaveRequestRow | null;
  if (!request) return { error: "Request not found" };
  if (request.status !== "pending_cover") return { error: "Request is not pending cover approval" };

  const resident = request.resident;
  const houseId = resident?.house_id ?? "";

  // Verify the current user is the covering resident, or authorized staff
  const coverResident = request.covering_resident;
  if (user.role === "resident" && coverResident?.user_id !== user.id) {
    return { error: "Only the covering resident can approve this" };
  }
  if (user.role !== "resident" && user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized for this house" };
  }

  // Workspace decides who reviews after the cover: 'both' and 'manager'
  // route to a house manager; 'admin' skips straight to an admin.
  const passApprover = await getPassApprover(adminClient, houseId);
  const nextStatus =
    passApprover === "admin" ? "pending_admin" : "pending_manager";

  const { error } = await adminClient
    .from("leave_requests")
    .update({
      status: nextStatus,
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

  // Notify whoever reviews next
  if (nextStatus === "pending_admin") {
    await sendNotificationToAdmins({
      type: "admin_approval",
      title: "Leave Request Needs Approval",
      message: `${resident?.full_name}'s leave request has been approved by the covering resident. Please review.`,
      actionUrl: "/leave-requests",
      entityType: "leave_request",
      entityId: requestId,
    });
  } else {
    await sendNotificationToHouseManagers(houseId, {
      type: "manager_approval",
      title: "Leave Request Needs Approval",
      message: `${resident?.full_name}'s leave request has been approved by the covering resident. Please review.`,
      actionUrl: "/leave-requests",
      entityType: "leave_request",
      entityId: requestId,
    });
  }

  revalidatePath("/leave-requests");
  return {};
}

export async function denyCoverRequest(requestId: string, note?: string) {
  const user = await requireAuth();
  // Mirror approveCoverRequest: RLS on leave_requests only permits the
  // requester or staff to read/update rows — the covering resident is
  // neither, so use the admin client and enforce permission in code.
  const adminClient = createAdminClient();

  const { data: rawRequest } = await adminClient
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id, user_id), covering_resident:residents!leave_requests_covering_resident_id_fkey(user_id)")
    .eq("id", requestId)
    .maybeSingle();

  const request = rawRequest as unknown as LeaveRequestRow | null;
  if (!request) return { error: "Request not found" };
  if (request.status !== "pending_cover") return { error: "Request is not pending cover approval" };

  const residentInfo = request.resident;
  const houseId = residentInfo?.house_id ?? "";

  // Verify the current user is the covering resident, or authorized staff
  const coverResident = request.covering_resident;
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

  const { data: rawRequest } = await supabase
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id)")
    .eq("id", requestId)
    .maybeSingle();

  const request = rawRequest as unknown as LeaveRequestRow | null;
  if (!request) return { error: "Request not found" };
  if (request.status !== "pending_manager") return { error: "Request is not pending manager approval" };

  const resident = request.resident;
  const houseId = resident?.house_id ?? "";

  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized for this house" };
  }

  // When the workspace lets managers give the final approval, this
  // completes the pass instead of routing it on to an admin.
  const passApprover = await getPassApprover(supabase, houseId);
  const managerFinal = passApprover === "manager";
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: managerFinal ? "approved" : "pending_admin",
      house_manager_approved_at: nowIso,
      house_manager_approved_by: user.id,
      ...(managerFinal
        ? { reviewed_by: user.id, reviewed_at: nowIso }
        : {}),
      updated_at: nowIso,
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
    description: `Leave request approved by manager ${user.full_name} for ${resident?.full_name}` + (managerFinal ? " (final approval)" : ""),
  });

  if (managerFinal) {
    const { data: residentUser } = await supabase
      .from("residents")
      .select("user_id")
      .eq("id", request.resident_id)
      .maybeSingle();
    if (residentUser?.user_id) {
      await sendNotification({
        userId: residentUser.user_id,
        type: "leave_approved",
        title: "Leave Request Approved!",
        message: "Your leave request has been approved by the house manager.",
        actionUrl: "/leave-requests",
        entityType: "leave_request",
        entityId: requestId,
      });
    }
  } else {
    // Notify admins
    await sendNotificationToAdmins({
      type: "admin_approval",
      title: "Leave Request Final Approval",
      message: `${resident?.full_name}'s leave request has been approved by the house manager. Final approval needed.`,
      actionUrl: "/leave-requests",
      entityType: "leave_request",
      entityId: requestId,
    });
  }

  revalidatePath("/leave-requests");
  return {};
}

export async function denyManagerRequest(requestId: string, note?: string) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: rawRequest } = await supabase
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id, user_id)")
    .eq("id", requestId)
    .maybeSingle();

  const request = rawRequest as unknown as LeaveRequestRow | null;
  if (!request) return { error: "Request not found" };
  if (request.status !== "pending_manager") return { error: "Request is not pending manager approval" };

  const resident = request.resident;
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

  const { data: rawRequest } = await supabase
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id, user_id)")
    .eq("id", requestId)
    .maybeSingle();

  const request = rawRequest as unknown as LeaveRequestRow | null;
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

  const resident = request.resident;

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

  const { data: rawRequest } = await supabase
    .from("leave_requests")
    .select("*, resident:residents!leave_requests_resident_id_fkey(full_name, house_id, user_id)")
    .eq("id", requestId)
    .maybeSingle();

  const request = rawRequest as unknown as LeaveRequestRow | null;
  if (!request) return { error: "Request not found" };
  // Mirror the admin-trumps-manager approval path: admins can deny at
  // either the manager or admin stage.
  if (request.status !== "pending_admin" && request.status !== "pending_manager") {
    return { error: "Request cannot be denied from its current status" };
  }

  const resident = request.resident;

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

  const { data: rawRequest } = await supabase
    .from("leave_requests")
    .select("status, resident_id, resident:residents!leave_requests_resident_id_fkey(full_name, house_id)")
    .eq("id", requestId)
    .maybeSingle();

  const request = rawRequest as unknown as LeaveRequestRow | null;
  if (!request) return { error: "Request not found" };

  // Only approved requests can be marked as returned
  if (request.status !== "approved") return { error: "Only approved requests can be marked as returned" };

  const resident = request.resident;
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
