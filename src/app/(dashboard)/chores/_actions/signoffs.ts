"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { getHouseToday, getHouseYesterday, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { sendNotification, sendNotificationToHouseManagers } from "@/lib/notifications";

// Shapes returned by PostgREST joins. TS can't parse the select string, so
// we narrow the joined rows centrally instead of casting at each access.
type RotationAssignmentJoin = {
  resident_id: string;
  rotation: { house_id: string } | null;
  chore: { name: string; house_id: string } | null;
};
type SignoffRow = {
  id: string;
  status: string;
  sign_off_date?: string | null;
  rotation_assignment_id?: string | null;
  rotation_assignment: RotationAssignmentJoin | null;
};

export async function markSignoffComplete(signoffId: string, photoUrl?: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  // Look up the signoff's assignment to verify authorization
  const { data: rawSignoff } = await supabase
    .from("chore_signoffs")
    .select("id, status, sign_off_date, rotation_assignment_id, rotation_assignment:chore_rotation_assignments(resident_id, rotation:chore_rotations(house_id))")
    .eq("id", signoffId)
    .maybeSingle();

  const signoff = rawSignoff as unknown as SignoffRow | null;
  if (!signoff) return { error: "Signoff not found" };

  // Only allow marking signoffs that are still pending
  if (signoff.status !== "pending") {
    return { error: "This signoff has already been submitted or reviewed" };
  }

  const assignment = signoff.rotation_assignment;
  const houseId = assignment?.rotation?.house_id ?? "";

  // Look up house timezone for accurate date checks
  const supabaseForTz = await createClient();
  const { data: houseRow } = await supabaseForTz
    .from("houses")
    .select("timezone")
    .eq("id", houseId)
    .maybeSingle();
  const tz = houseRow?.timezone ?? DEFAULT_TIMEZONE;
  const todayLocal = getHouseToday(tz);
  const yesterdayLocal = getHouseYesterday(tz);

  if (user.role === "resident") {
    // Residents can only complete their own signoffs
    const { data: residentRecord } = await supabase
      .from("residents")
      .select("id, force_photo")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!residentRecord || residentRecord.id !== assignment?.resident_id) {
      return { error: "Not authorized" };
    }

    // Residents can only mark today's signoff (with ±1 day grace)
    if (signoff.sign_off_date !== todayLocal && signoff.sign_off_date !== yesterdayLocal) {
      return { error: "You can only sign off on today's chore" };
    }

    // Check if force_photo is enabled
    if (residentRecord.force_photo && !photoUrl) {
      return { error: "Photo is required — please upload a photo before signing off" };
    }
  } else {
    // Staff must have access to the house
    if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
      return { error: "Not authorized" };
    }
  }

  const updateData: Record<string, unknown> = {
    status: "completed_pending_review",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (photoUrl) {
    updateData.photo_url = photoUrl;
  }

  const { error } = await supabase
    .from("chore_signoffs")
    .update(updateData)
    .eq("id", signoffId);

  if (error) return { error: error.message };

  // Notify house managers when a resident submits a signoff for review
  if (user.role === "resident" && houseId) {
    await sendNotificationToHouseManagers(houseId, {
      type: "chore_submitted",
      title: "Chore Submitted for Review",
      message: `${user.full_name} submitted a chore for review.`,
      actionUrl: "/chores",
      entityType: "chore_signoff",
      entityId: signoffId,
    });
  }

  revalidatePath("/chores");
  return {};
}

export async function reviewSignoff(
  signoffId: string,
  action: "approve" | "reject",
  rejectionNote?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  // Verify house-scoped access before mutating
  const { data: rawSignoffData } = await supabase
    .from("chore_signoffs")
    .select("rotation_assignment:chore_rotation_assignments(rotation:chore_rotations(house_id))")
    .eq("id", signoffId)
    .maybeSingle();

  const signoffData = rawSignoffData as unknown as Pick<SignoffRow, "rotation_assignment"> | null;
  if (signoffData) {
    const ra = signoffData.rotation_assignment;
    const houseId = ra?.rotation?.house_id ?? "";
    if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
      return { error: "Not authorized" };
    }
  }

  const updateData: Record<string, unknown> = {
    status: action === "approve" ? "approved" : "rejected",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (action === "reject" && rejectionNote) {
    updateData.rejection_note = rejectionNote;
  }

  const { error } = await supabase
    .from("chore_signoffs")
    .update(updateData)
    .eq("id", signoffId);

  if (error) return { error: error.message };

  // Get details for activity log
  const { data: rawSignoff } = await supabase
    .from("chore_signoffs")
    .select(
      "rotation_assignment:chore_rotation_assignments(resident_id, chore:chores(name, house_id))"
    )
    .eq("id", signoffId)
    .maybeSingle();

  const signoff = rawSignoff as unknown as Pick<SignoffRow, "rotation_assignment"> | null;
  if (signoff?.rotation_assignment) {
    const ra = signoff.rotation_assignment;
    await logActivity({
      houseId: ra.chore?.house_id,
      residentId: ra.resident_id,
      actorId: user.id,
      eventType: action === "approve" ? "chore_approved" : "chore_rejected",
      entityType: "chore_signoff",
      entityId: signoffId,
      description: `"${ra.chore?.name}" signoff ${action}d by ${user.full_name}`,
    });

    // Notify the resident about the review result
    const { data: residentUser } = await supabase
      .from("residents")
      .select("user_id")
      .eq("id", ra.resident_id)
      .maybeSingle();

    if (residentUser?.user_id) {
      await sendNotification({
        userId: residentUser.user_id,
        type: action === "approve" ? "chore_approved" : "chore_rejected",
        title: action === "approve" ? "Chore Approved" : "Chore Rejected",
        message: action === "approve"
          ? `Your "${ra.chore?.name}" chore was approved.`
          : `Your "${ra.chore?.name}" chore was rejected.${rejectionNote ? ` Reason: ${rejectionNote}` : " Please redo it."}`,
        actionUrl: "/chores",
        entityType: "chore_signoff",
        entityId: signoffId,
      });
    }
  }

  revalidatePath("/chores");
  return {};
}

// --- Staff Override Signoff Status ---

export async function overrideSignoffStatus(
  signoffId: string,
  newStatus: "pending" | "approved" | "rejected" | "missed" | "completed_pending_review",
  note?: string
) {
  const user = await requireAuth();
  if (user.role === "resident") return { error: "Not authorized" };

  const supabase = await createClient();

  const { data: rawSignoff } = await supabase
    .from("chore_signoffs")
    .select("id, status, rotation_assignment:chore_rotation_assignments(resident_id, chore:chores(name, house_id))")
    .eq("id", signoffId)
    .maybeSingle();

  const signoff = rawSignoff as unknown as SignoffRow | null;
  if (!signoff) return { error: "Signoff not found" };

  const ra = signoff.rotation_assignment;
  const houseId = ra?.chore?.house_id ?? "";
  if (user.role !== "admin" && !canAccessHouse(user, houseId)) {
    return { error: "Not authorized" };
  }

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "rejected") {
    updateData.reviewed_by = user.id;
    updateData.reviewed_at = new Date().toISOString();
    if (note) updateData.rejection_note = note;
  }
  if (newStatus === "approved") {
    updateData.reviewed_by = user.id;
    updateData.reviewed_at = new Date().toISOString();
  }
  if (newStatus === "pending") {
    updateData.completed_at = null;
    updateData.reviewed_by = null;
    updateData.reviewed_at = null;
    updateData.rejection_note = null;
  }

  // If changing FROM missed to another status, auto-reverse the linked demerit
  const oldStatus = signoff.status;

  const { error } = await supabase
    .from("chore_signoffs")
    .update(updateData)
    .eq("id", signoffId);

  if (error) return { error: error.message };

  if (oldStatus === "missed" && newStatus !== "missed") {
    // Delete any auto-generated demerit linked to this signoff
    const { data: linkedDemerits } = await supabase
      .from("demerits")
      .select("id")
      .eq("signoff_id", signoffId);

    if (linkedDemerits && linkedDemerits.length > 0) {
      for (const d of linkedDemerits) {
        await supabase.from("demerits").delete().eq("id", d.id);
      }
      await logActivity({
        houseId,
        residentId: ra?.resident_id,
        actorId: user.id,
        eventType: "demerit_auto_reversed",
        entityType: "demerit",
        entityId: signoffId,
        description: `Auto-reversed demerit for "${ra?.chore?.name}" — signoff status changed from missed to ${newStatus}`,
      });
    }
  }

  await logActivity({
    houseId,
    residentId: ra?.resident_id,
    actorId: user.id,
    eventType: "chore_signoff_overridden",
    entityType: "chore_signoff",
    entityId: signoffId,
    description: `"${ra?.chore?.name}" signoff status changed to ${newStatus} by ${user.full_name}`,
  });

  revalidatePath("/chores");
  revalidatePath("/discipline");
  return {};
}

// --- Resident Redo After Rejection ---

export async function redoSignoff(signoffId: string, photoUrl?: string) {
  const user = await requireAuth();
  if (user.role !== "resident") return { error: "Only residents can redo signoffs" };

  const supabase = await createClient();

  const { data: rawSignoff } = await supabase
    .from("chore_signoffs")
    .select("id, status, sign_off_date, rotation_assignment_id, rotation_assignment:chore_rotation_assignments(resident_id, rotation:chore_rotations(house_id))")
    .eq("id", signoffId)
    .maybeSingle();

  const signoff = rawSignoff as unknown as SignoffRow | null;
  if (!signoff) return { error: "Signoff not found" };
  if (signoff.status !== "rejected") {
    return { error: "Only rejected signoffs can be redone" };
  }

  const assignment = signoff.rotation_assignment;

  // Verify this is the resident's own signoff
  const { data: residentRecord } = await supabase
    .from("residents")
    .select("id, force_photo")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!residentRecord || residentRecord.id !== assignment?.resident_id) {
    return { error: "Not authorized" };
  }

  if (residentRecord.force_photo && !photoUrl) {
    return { error: "Photo is required — please upload a photo before signing off" };
  }

  const updateData: Record<string, unknown> = {
    status: "completed_pending_review",
    completed_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    rejection_note: null,
    updated_at: new Date().toISOString(),
  };

  if (photoUrl) {
    updateData.photo_url = photoUrl;
  }

  const { error } = await supabase
    .from("chore_signoffs")
    .update(updateData)
    .eq("id", signoffId);

  if (error) return { error: error.message };

  // Notify house managers when a resident resubmits a signoff for review
  const houseId = assignment?.rotation?.house_id ?? "";
  if (houseId) {
    await sendNotificationToHouseManagers(houseId, {
      type: "chore_submitted",
      title: "Chore Resubmitted for Review",
      message: `${user.full_name} resubmitted a chore for review after rejection.`,
      actionUrl: "/chores",
      entityType: "chore_signoff",
      entityId: signoffId,
    });
  }

  revalidatePath("/chores");
  return {};
}

/**
 * Complete a chore by choreId + residentId + date.
 * Finds the matching signoff record and delegates to markSignoffComplete.
 * Used by the resident-facing chore-completion-form.
 */
export async function completeChore(
  choreId: string,
  residentId: string,
  date: string,
  photoUrl?: string
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createClient();

  // Find the signoff for this chore assignment on this date
  const { data: signoff } = await supabase
    .from("chore_signoffs")
    .select("id, rotation_assignment:chore_rotation_assignments!inner(resident_id, rotation:chore_rotations!inner(house_id), chore_id)")
    .eq("sign_off_date", date)
    .eq("status", "pending")
    .eq("rotation_assignment.resident_id", residentId)
    .eq("rotation_assignment.chore_id", choreId)
    .maybeSingle();

  if (!signoff) {
    return { error: "No pending signoff found for this chore today" };
  }

  return markSignoffComplete(signoff.id, photoUrl);
}
