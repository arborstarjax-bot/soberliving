"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

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
  "push_intakes",
] as const);

/** Toggle a boolean push notification preference. */
export async function updatePushPreference(
  key: "push_chores" | "push_bulletin" | "push_discipline" | "push_intakes",
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

const ALLOWED_SIGN_IN_OUT_VALUES = new Set(["off", "all", "curfew_only"]);

/** Update the three-state sign-in/out push preference. */
export async function updateSignInOutPreference(
  value: "off" | "all" | "curfew_only"
) {
  if (!ALLOWED_SIGN_IN_OUT_VALUES.has(value)) {
    return { error: "Invalid preference" };
  }

  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    return { error: "Not authorized" };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({ push_sign_in_out: value, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

