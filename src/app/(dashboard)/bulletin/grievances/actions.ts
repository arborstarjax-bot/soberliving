"use server";
import { err, ok } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import type { GrievanceStatus } from "@/lib/types";

const ALLOWED_STATUSES: GrievanceStatus[] = [
  "open",
  "in_progress",
  "resolved",
];

/**
 * Ensures the caller has permission to read/mutate the given
 * grievance. Admins can always touch any row; managers only rows
 * whose `house_id` is one of their assigned houses. Anonymous
 * grievances (house_id NULL) are therefore admin-only by design.
 */
async function authorizeGrievanceAccess(grievanceId: string) {
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    return err("Not authorized");
  }
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("grievances")
    .select("id, house_id, workspace_id")
    .eq("id", grievanceId)
    .maybeSingle();
  if (!row) return err("Grievance not found");

  const houseId = (row.house_id as string | null) ?? null;
  // House-scoped grievances check the house; anonymous rows (house_id
  // NULL) fall back to the grievance's stamped workspace.
  const allowed = houseId
    ? canAccessHouse(user, houseId)
    : user.role === "admin" &&
      row.workspace_id === user.workspace_id;
  if (!allowed) {
    return err("Not authorized");
  }
  return ok({ user, admin });
}

export async function updateGrievanceStatus(
  grievanceId: string,
  status: GrievanceStatus
) {
  if (!ALLOWED_STATUSES.includes(status)) {
    return err("Invalid status");
  }
  const auth = await authorizeGrievanceAccess(grievanceId);
  if (!auth.ok) return err(auth.error);

  const update: {
    status: GrievanceStatus;
    updated_at: string;
    resolved_at?: string | null;
    resolved_by?: string | null;
  } = { status, updated_at: new Date().toISOString() };

  if (status === "resolved") {
    update.resolved_at = new Date().toISOString();
    update.resolved_by = auth.user.id;
  } else {
    update.resolved_at = null;
    update.resolved_by = null;
  }

  const { error } = await auth
    .admin!.from("grievances")
    .update(update)
    .eq("id", grievanceId);
  if (error) return err(error.message);

  revalidatePath("/bulletin/grievances");
  revalidatePath(`/bulletin/grievances/${grievanceId}`);
  return ok({ ok: true });
}

export async function updateGrievanceNotes(
  grievanceId: string,
  notes: string
) {
  const auth = await authorizeGrievanceAccess(grievanceId);
  if (!auth.ok) return err(auth.error);

  const trimmed = notes.trim();
  const { error } = await auth
    .admin!.from("grievances")
    .update({
      internal_notes: trimmed === "" ? null : trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", grievanceId);
  if (error) return err(error.message);

  revalidatePath(`/bulletin/grievances/${grievanceId}`);
  return ok({ ok: true });
}

/**
 * Mint a short-lived signed URL for a grievance attachment. Same
 * authorization rules as the detail page (admin or scope-matching
 * manager) so managers can't guess a path for a grievance they
 * shouldn't see.
 */
export async function getGrievanceAttachmentUrl(
  grievanceId: string,
  path: string
) {
  const auth = await authorizeGrievanceAccess(grievanceId);
  if (!auth.ok) return err(auth.error);

  const { data: row } = await auth
    .admin!.from("grievances")
    .select("attachment_paths")
    .eq("id", grievanceId)
    .maybeSingle();
  const paths = (row?.attachment_paths as string[] | null) ?? [];
  if (!paths.includes(path)) {
    return err("Attachment not found on this grievance");
  }

  const { data, error } = await auth
    .admin!.storage.from("grievance-attachments")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    return err(error?.message ?? "Sign failed");
  }
  return ok({ url: data.signedUrl });
}
