"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { GrievanceType } from "@/lib/types";

const BUCKET = "grievance-attachments";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 5;

/**
 * Upload a single grievance attachment and return its storage path.
 *
 * We deliberately do NOT include the uploader's user_id in the
 * storage path — otherwise an admin inspecting the bucket directly
 * could correlate an anonymous submission with a specific resident.
 * Instead files live under `pending/<timestamp>-<random>-<filename>`
 * while the form is being filled out, then are referenced from the
 * grievances row on submit. Anonymous files stay at their pending
 * path; non-anonymous files are left in place too (the row row
 * carries user_id so there's no extra privacy benefit to renaming).
 */
export async function uploadGrievanceAttachment(formData: FormData) {
  // Must be signed in to upload (to prevent bucket abuse), but we
  // don't persist anything that ties the file back to the user here
  // — see comment above.
  await requireAuth();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file provided", path: null };
  }
  if (file.size > MAX_BYTES) {
    return {
      error: `File too large (max ${MAX_BYTES / (1024 * 1024)}MB)`,
      path: null,
    };
  }

  const admin = createAdminClient();
  const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `pending/${Date.now()}-${rand}-${safeBase}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return { error: error.message, path: null };
  return { path };
}

interface SubmitGrievanceInput {
  reportType: GrievanceType;
  subject: string;
  description: string;
  attachmentPaths: string[];
  submitAnonymously: boolean;
}

/**
 * Resident-facing entry point to file a grievance / problem report.
 * Anonymous mode zeroes out both user_id and house_id so admin-side
 * reads have no server-stored trace back to the submitter. The
 * activity_log is intentionally NOT written for anonymous
 * submissions for the same reason.
 */
export async function submitGrievance(input: SubmitGrievanceInput) {
  const user = await requireAuth();

  const subject = input.subject.trim();
  const description = input.description.trim();
  if (!subject) return { error: "Subject is required" };
  if (!description) return { error: "Description is required" };
  if (input.reportType !== "grievance" && input.reportType !== "problem") {
    return { error: "Invalid report type" };
  }
  if (input.attachmentPaths.length > MAX_FILES) {
    return { error: `Too many attachments (max ${MAX_FILES})` };
  }

  const admin = createAdminClient();

  let houseId: string | null = null;
  if (!input.submitAnonymously) {
    // Snapshot the resident's active house at submission time so
    // manager-scope filters stay correct even if the resident moves
    // later. If the user is staff or has no active residents row
    // (edge case), house_id stays null.
    const { data: residentRow } = await admin
      .from("residents")
      .select("house_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    houseId = (residentRow?.house_id as string | null) ?? null;
  }

  const { error } = await admin.from("grievances").insert({
    user_id: input.submitAnonymously ? null : user.id,
    house_id: input.submitAnonymously ? null : houseId,
    // Set even for anonymous reports: the workspace is a tenant
    // boundary, not an identifying detail, and it keeps anonymous
    // grievances from leaking into other workspaces' admin views.
    workspace_id: user.workspace_id,
    submitted_anonymously: input.submitAnonymously,
    report_type: input.reportType,
    subject,
    description,
    attachment_paths: input.attachmentPaths,
    status: "open",
  });

  if (error) return { error: error.message };

  // Not awaited / not called for anonymous submissions — activity_log
  // rows carry actor_id and would otherwise tie an anonymous report
  // back to the submitter.
  revalidatePath("/bulletin/grievances");
  return { ok: true };
}
