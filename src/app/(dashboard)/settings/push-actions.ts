"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import webpush from "web-push";

/** Save a Web Push subscription for the current user's device. */
export async function subscribePush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const user = await requireAuth();
  const admin = createAdminClient();

  // Upsert: if this endpoint already exists, just update keys.
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" }
  );

  if (error) return { error: error.message };
  return { ok: true as const };
}

/** Remove a Web Push subscription (user opted out or unsubscribed). */
export async function unsubscribePush(endpoint: string) {
  const user = await requireAuth();
  const admin = createAdminClient();

  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) return { error: error.message };
  return { ok: true as const };
}

const ALLOWED_PUSH_KEYS = new Set([
  "push_chores",
  "push_bulletin",
  "push_discipline",
] as const);

/** Toggle a push notification preference (chores, bulletin, discipline). */
export async function updatePushPreference(
  key: "push_chores" | "push_bulletin" | "push_discipline",
  enabled: boolean
) {
  if (!ALLOWED_PUSH_KEYS.has(key) || typeof enabled !== "boolean") {
    return { error: "Invalid preference" };
  }

  const user = await requireAuth();
  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({ [key]: enabled, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

/** Send a test push to the current user's devices. Returns per-device results. */
export async function sendTestPush() {
  const user = await requireAuth();
  const admin = createAdminClient();

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY ?? "";
  const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@houseflow.app";

  if (!vapidPublic || !vapidPrivate) {
    return {
      error: `VAPID keys missing: public=${!!vapidPublic}, private=${!!vapidPrivate}`,
    };
  }

  // Configure VAPID for this request
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  } catch (err) {
    return { error: `VAPID config failed: ${String(err)}` };
  }

  // Check subscriptions
  const { data: subs, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (subsError) {
    return { error: `Subscriptions query failed: ${subsError.message}` };
  }

  if (!subs || subs.length === 0) {
    return {
      error: "No push subscriptions found. Toggle push off and back on.",
    };
  }

  const payload = JSON.stringify({
    title: "Test Notification",
    body: "If you see this, push notifications are working!",
    url: "/settings",
  });

  // Send to each device and collect per-device results
  const deviceResults: { endpoint: string; status: string; detail: string }[] = [];
  const staleIds: string[] = [];

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const ep = subs[i].endpoint.slice(0, 80);
    if (r.status === "fulfilled") {
      deviceResults.push({
        endpoint: ep,
        status: "delivered",
        detail: `HTTP ${r.value.statusCode}`,
      });
    } else {
      const reason = r.reason as { statusCode?: number; body?: string; message?: string };
      const code = reason?.statusCode ?? 0;
      const body = reason?.body ?? reason?.message ?? String(r.reason);
      deviceResults.push({
        endpoint: ep,
        status: "failed",
        detail: `HTTP ${code}: ${body.slice(0, 200)}`,
      });
      if (code === 410 || code === 404) {
        staleIds.push(subs[i].id);
      }
    }
  }

  // Clean up stale subscriptions
  if (staleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }

  const delivered = deviceResults.filter((d) => d.status === "delivered").length;
  const failed = deviceResults.filter((d) => d.status === "failed").length;

  return {
    ok: delivered > 0,
    summary: `${delivered} delivered, ${failed} failed of ${subs.length} device(s)`,
    devices: deviceResults,
    staleRemoved: staleIds.length,
  };
}
