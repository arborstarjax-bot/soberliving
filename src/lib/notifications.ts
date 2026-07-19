import "server-only";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWebPush } from "@/lib/push";

interface SendNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export async function sendNotification({
  userId,
  type,
  title,
  message,
  actionUrl,
  entityType,
  entityId,
  metadata,
}: SendNotificationParams) {
  const adminClient = createAdminClient();

  const { error } = await adminClient.from("notifications").insert({
    user_id: userId,
    type,
    title,
    message,
    action_url: actionUrl ?? null,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    metadata: metadata ?? null,
  });

  if (error) {
    console.error("Failed to send notification:", error);
  }

  // Schedule web push delivery after the response is sent so the
  // in-app notification is never blocked and the serverless runtime
  // stays alive until delivery completes.
  const pastCurfew = metadata?.past_curfew === true;
  after(async () => {
    try {
      await sendWebPush(userId, type, {
        title,
        body: message,
        url: actionUrl,
      }, { pastCurfew });
    } catch (err) {
      console.error("[push] web push failed:", err);
    }
  });
}

export async function sendNotificationToHouseManagers(
  houseId: string,
  params: Omit<SendNotificationParams, "userId">
) {
  const adminClient = createAdminClient();

  const { data: managers } = await adminClient
    .from("manager_house_assignments")
    .select("user_id")
    .eq("house_id", houseId)
    .is("unassigned_at", null);

  if (managers) {
    for (const m of managers) {
      await sendNotification({ ...params, userId: m.user_id });
    }
  }
}

export async function sendNotificationToAdmins(
  params: Omit<SendNotificationParams, "userId">,
  options?: { workspaceId?: string | null }
) {
  const adminClient = createAdminClient();

  const workspaceId = options?.workspaceId ?? null;
  const adminsQuery = workspaceId
    ? adminClient
        .from("user_roles")
        .select("user_id, users!inner(workspace_id)")
        .eq("role", "admin")
        .eq("users.workspace_id", workspaceId)
    : adminClient.from("user_roles").select("user_id").eq("role", "admin");

  const { data: admins } = await adminsQuery;

  if (admins) {
    for (const a of admins) {
      await sendNotification({
        ...params,
        userId: (a as { user_id: string }).user_id,
      });
    }
  }
}

/**
 * Fan a single notification out to every staff member who needs to know
 * about a house-scoped event: all admins + all active managers of the
 * given house. The set is deduplicated, so an admin who also happens to
 * be a manager of that house only receives one copy.
 *
 * Optionally pass `excludeUserId` to skip the actor who triggered the
 * event (avoids sending someone a notification about their own action).
 * Pass `houseId = null` when no house is associated (e.g. an intake
 * submission where the applicant has not yet picked a house) — only
 * admins will be notified in that case. Pass `options.workspaceId` for
 * those house-less cases so admins are still scoped to one workspace;
 * when a houseId is given the workspace is derived from the house.
 */
export async function notifyHouseStaff(
  houseId: string | null,
  params: Omit<SendNotificationParams, "userId">,
  options?: { excludeUserId?: string | null; workspaceId?: string | null }
) {
  const adminClient = createAdminClient();

  // Resolve the workspace so admins can be scoped to it: an explicit
  // workspaceId wins, otherwise derive it from the house.
  let workspaceId = options?.workspaceId ?? null;
  if (!workspaceId && houseId) {
    const { data: houseRow } = await adminClient
      .from("houses")
      .select("workspace_id")
      .eq("id", houseId)
      .maybeSingle();
    workspaceId = (houseRow?.workspace_id as string | null) ?? null;
  }

  const adminsQuery = workspaceId
    ? adminClient
        .from("user_roles")
        .select("user_id, users!inner(workspace_id)")
        .eq("role", "admin")
        .eq("users.workspace_id", workspaceId)
    : adminClient.from("user_roles").select("user_id").eq("role", "admin");

  const [adminsRes, managersRes] = await Promise.all([
    adminsQuery,
    houseId
      ? adminClient
          .from("manager_house_assignments")
          .select("user_id")
          .eq("house_id", houseId)
          .is("unassigned_at", null)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);

  const recipients = new Set<string>();
  for (const a of adminsRes.data ?? []) {
    recipients.add((a as { user_id: string }).user_id);
  }
  for (const m of (managersRes as { data: { user_id: string }[] | null }).data ?? []) {
    recipients.add(m.user_id);
  }
  if (options?.excludeUserId) recipients.delete(options.excludeUserId);

  for (const userId of recipients) {
    await sendNotification({ ...params, userId });
  }
}
