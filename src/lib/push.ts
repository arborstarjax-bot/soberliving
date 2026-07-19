import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";

// VAPID keys are loaded from environment variables.
// NEXT_PUBLIC_VAPID_PUBLIC_KEY is also available to the client for
// subscription registration. VAPID_PRIVATE_KEY is server-only.
const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
const rawSubject = (process.env.VAPID_SUBJECT ?? "").trim();
const VAPID_SUBJECT =
  rawSubject.startsWith("mailto:") || rawSubject.startsWith("https://")
    ? rawSubject
    : "mailto:admin@houseflow.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Sign-in/out notifications have a three-state preference (off/all/curfew_only).
const SIGN_IN_OUT_TYPES = new Set([
  "resident_signed_out",
  "resident_signed_in",
]);

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

interface PushOptions {
  /** True when the event is a curfew violation (late sign-in). */
  pastCurfew?: boolean;
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
  payload: PushPayload,
  options?: PushOptions
) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[push] VAPID keys not configured, skipping");
    return;
  }

  const isSignInOut = SIGN_IN_OUT_TYPES.has(type);

  const admin = createAdminClient();

  // Sign-in/out has a three-state preference — check it.
  if (isSignInOut) {
    const { data: user, error: userError } = await admin
      .from("users")
      .select("push_sign_in_out")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      console.error(`[push] failed to query user prefs for ${userId}:`, userError?.message);
      return;
    }

    const signPref = (user as Record<string, unknown>).push_sign_in_out as string;
    if (signPref === "off" || !signPref) {
      console.log(`[push] user ${userId} has push_sign_in_out=off, skipping`);
      return;
    }
    if (signPref === "curfew_only" && !options?.pastCurfew) {
      console.log(`[push] user ${userId} has push_sign_in_out=curfew_only and event is not past curfew, skipping`);
      return;
    }
  }

  // Fetch all registered push subscriptions for this user.
  const { data: subs, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (subsError) {
    console.error(`[push] failed to query subscriptions for ${userId}:`, subsError.message);
    return;
  }

  if (!subs || subs.length === 0) {
    console.warn(`[push] no subscriptions found for user ${userId}`);
    return;
  }

  console.log(`[push] sending "${type}" to ${subs.length} device(s) for user ${userId}`);

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

  // Log delivery results.
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      console.log(`[push] delivered to endpoint ${subs[i].endpoint.slice(0, 60)}…`);
    } else {
      console.error(`[push] failed for endpoint ${subs[i].endpoint.slice(0, 60)}…:`, r.reason);
    }
  }

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
  payload: PushPayload,
  options?: PushOptions
) {
  await Promise.allSettled(
    userIds.map((uid) => sendWebPush(uid, type, payload, options))
  );
}
