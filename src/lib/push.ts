import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";

// VAPID keys are loaded from environment variables.
// NEXT_PUBLIC_VAPID_PUBLIC_KEY is also available to the client for
// subscription registration. VAPID_PRIVATE_KEY is server-only.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@houseflow.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Notification types that map to each push preference column.
const CHORE_TYPES = new Set([
  "chore_reminder",
  "chore_assigned",
]);

const BULLETIN_TYPES = new Set([
  "bulletin_post",
]);

const DISCIPLINE_TYPES = new Set([
  "demerit_issued",
  "warning_issued",
]);

type PushPreferenceColumn = "push_chores" | "push_bulletin" | "push_discipline";

function preferenceColumnForType(type: string): PushPreferenceColumn | null {
  if (CHORE_TYPES.has(type)) return "push_chores";
  if (BULLETIN_TYPES.has(type)) return "push_bulletin";
  if (DISCIPLINE_TYPES.has(type)) return "push_discipline";
  return null;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Send a web push notification to all of a user's registered devices,
 * respecting their per-category preference toggles.
 *
 * Silently skips if VAPID keys aren't configured, the notification type
 * isn't push-eligible, or the user has disabled that category.
 */
export async function sendWebPush(
  userId: string,
  type: string,
  payload: PushPayload
) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const prefColumn = preferenceColumnForType(type);
  if (!prefColumn) return; // not a push-eligible type

  const admin = createAdminClient();

  // Check the user's preference for this category.
  const { data: user } = await admin
    .from("users")
    .select("push_chores, push_bulletin, push_discipline")
    .eq("id", userId)
    .single();

  if (!user) return;
  const prefs = user as Record<string, boolean>;
  if (prefs[prefColumn] === false) return;

  // Fetch all registered push subscriptions for this user.
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return;

  const jsonPayload = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        jsonPayload
      )
    )
  );

  // Clean up expired/unsubscribed endpoints (410 Gone or 404).
  const staleIds: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (
      r.status === "rejected" &&
      r.reason &&
      typeof r.reason === "object" &&
      "statusCode" in r.reason &&
      (r.reason.statusCode === 410 || r.reason.statusCode === 404)
    ) {
      staleIds.push(subs[i].id);
    }
  }

  if (staleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }
}

/**
 * Fan a push notification to multiple users at once.
 * Used by bulletin posts that notify all residents in a house.
 */
export async function sendWebPushToMany(
  userIds: string[],
  type: string,
  payload: PushPayload
) {
  await Promise.allSettled(
    userIds.map((uid) => sendWebPush(uid, type, payload))
  );
}
