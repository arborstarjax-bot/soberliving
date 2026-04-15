import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

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
  params: Omit<SendNotificationParams, "userId">
) {
  const adminClient = createAdminClient();

  const { data: admins } = await adminClient
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (admins) {
    for (const a of admins) {
      await sendNotification({ ...params, userId: a.user_id });
    }
  }
}
