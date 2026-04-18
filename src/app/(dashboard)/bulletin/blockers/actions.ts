"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { canAccessHouse } from "@/lib/permissions";
import type { BlockerTargetType } from "@/lib/types";

const BUCKET = "blocker-attachments";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 5;
const ALLOWED_TARGETS: BlockerTargetType[] = ["all", "house", "residents"];

function canCreateBlockers(role: string): boolean {
  return role === "admin" || role === "manager";
}

/**
 * Upload a single blocker attachment to the blocker-attachments
 * bucket. Returns the storage path (NOT a public URL) so the client
 * can accumulate paths and submit them with the rest of the form.
 * Signed URLs are minted per-request when residents or admins need
 * to view the file.
 */
export async function uploadBlockerAttachment(formData: FormData) {
  const user = await requireAuth();
  if (!canCreateBlockers(user.role)) {
    return { error: "Not authorized", path: null };
  }
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
  const path = `${user.id}/${Date.now()}-${safeBase}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return { error: error.message, path: null };
  return { path };
}

interface CreateBlockerInput {
  title: string;
  body: string;
  targetType: BlockerTargetType;
  targetHouseIds: string[];
  targetUserIds: string[];
  attachmentPaths: string[];
  saveToDocs: boolean;
}

export async function createBlocker(input: CreateBlockerInput) {
  const user = await requireAuth();
  if (!canCreateBlockers(user.role)) {
    return { error: "Not authorized" };
  }

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { error: "Title is required" };
  if (!body) return { error: "Message body is required" };
  if (!ALLOWED_TARGETS.includes(input.targetType)) {
    return { error: "Invalid target" };
  }
  if (input.attachmentPaths.length > MAX_FILES) {
    return { error: `Too many attachments (max ${MAX_FILES})` };
  }

  const admin = createAdminClient();

  // Managers can only target houses they're assigned to. Confirm each
  // target house is in their assigned set; for target_type='residents'
  // we resolve each resident's active house and require the manager
  // to have access to it.
  if (user.role === "manager") {
    if (input.targetType === "all") {
      return {
        error:
          "Managers can only target specific houses or residents, not everyone.",
      };
    }
    if (input.targetType === "house") {
      for (const hid of input.targetHouseIds) {
        if (!canAccessHouse(user, hid)) {
          return { error: "You can't target a house you're not assigned to." };
        }
      }
    }
    if (input.targetType === "residents") {
      if (input.targetUserIds.length === 0) {
        return { error: "Pick at least one resident." };
      }
      const { data: residents } = await admin
        .from("residents")
        .select("user_id, house_id")
        .in("user_id", input.targetUserIds)
        .eq("status", "active");
      for (const r of residents ?? []) {
        if (!canAccessHouse(user, r.house_id as string)) {
          return {
            error:
              "One or more residents are not in your assigned houses.",
          };
        }
      }
    }
  }

  // Housekeep the targeting fields so we never persist stale arrays
  // from a form state that toggled between modes.
  const houseIds =
    input.targetType === "house" ? input.targetHouseIds : [];
  const userIds =
    input.targetType === "residents" ? input.targetUserIds : [];

  if (input.targetType === "house" && houseIds.length === 0) {
    return { error: "Pick at least one house." };
  }
  if (input.targetType === "residents" && userIds.length === 0) {
    return { error: "Pick at least one resident." };
  }

  const { data: inserted, error } = await admin
    .from("blockers")
    .insert({
      title,
      body,
      attachment_paths: input.attachmentPaths,
      target_type: input.targetType,
      target_house_ids: houseIds,
      target_user_ids: userIds,
      save_to_docs: input.saveToDocs,
      created_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted) {
    return { error: error?.message ?? "Failed to create blocker" };
  }

  await logActivity({
    actorId: user.id,
    eventType: "blocker_created",
    entityType: "blocker",
    entityId: inserted.id as string,
    description: `${user.full_name} created blocker "${title}"`,
  });

  revalidatePath("/bulletin/blockers");
  // Any targeted resident's next navigation should trip the gate;
  // invalidate the dashboard layout cache so it re-evaluates.
  revalidatePath("/", "layout");
  return { id: inserted.id as string };
}

export async function archiveBlocker(blockerId: string) {
  const user = await requireAuth();
  if (!canCreateBlockers(user.role)) {
    return { error: "Not authorized" };
  }
  const admin = createAdminClient();

  // Managers can only archive blockers they authored — admins can
  // archive anything.
  const { data: blocker } = await admin
    .from("blockers")
    .select("id, title, created_by, archived_at")
    .eq("id", blockerId)
    .maybeSingle();
  if (!blocker) return { error: "Blocker not found" };
  if (blocker.archived_at) return { error: "Already archived" };
  if (user.role !== "admin" && blocker.created_by !== user.id) {
    return { error: "You can only archive blockers you created." };
  }

  const { error } = await admin
    .from("blockers")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", blockerId);
  if (error) return { error: error.message };

  await logActivity({
    actorId: user.id,
    eventType: "blocker_archived",
    entityType: "blocker",
    entityId: blockerId,
    description: `${user.full_name} archived blocker "${blocker.title}"`,
  });

  revalidatePath("/bulletin/blockers");
  revalidatePath("/", "layout");
  return {};
}

/**
 * Staff-side signed URL for a blocker attachment, used to preview
 * uploads on the admin list.
 */
export async function getBlockerAttachmentUrlAdmin(storagePath: string) {
  const user = await requireAuth();
  if (!canCreateBlockers(user.role)) {
    return { error: "Not authorized" };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error || !data) return { error: error?.message ?? "Failed to sign URL" };
  return { url: data.signedUrl };
}
