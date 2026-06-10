"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { sendWebPush } from "@/lib/push";

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

/** Send a test push to the current user's devices. Returns diagnostic info. */
export async function sendTestPush() {
  const user = await requireAuth();
  const admin = createAdminClient();

  // Check VAPID keys
  const hasPublic = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const hasPrivate = !!process.env.VAPID_PRIVATE_KEY;
  if (!hasPublic || !hasPrivate) {
    return {
      error: `VAPID keys missing: public=${hasPublic}, private=${hasPrivate}`,
    };
  }

  // Check push preference columns exist on user
  const { data: prefs, error: prefsError } = await admin
    .from("users")
    .select("push_chores, push_bulletin, push_discipline")
    .eq("id", user.id)
    .single();

  if (prefsError) {
    return { error: `User prefs query failed: ${prefsError.message}` };
  }

  // Check subscriptions
  const { data: subs, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint")
    .eq("user_id", user.id);

  if (subsError) {
    return { error: `Subscriptions query failed: ${subsError.message}` };
  }

  if (!subs || subs.length === 0) {
    return {
      error: "No push subscriptions found for your account. Try toggling push notifications off and back on.",
    };
  }

  // Attempt send
  try {
    await sendWebPush(user.id, "demerit_issued", {
      title: "Test Notification",
      body: "If you see this, push notifications are working!",
      url: "/settings",
    });
  } catch (err) {
    return { error: `sendWebPush threw: ${String(err)}` };
  }

  return {
    ok: true as const,
    debug: {
      subscriptionCount: subs.length,
      prefs: prefs as Record<string, boolean>,
    },
  };
}
