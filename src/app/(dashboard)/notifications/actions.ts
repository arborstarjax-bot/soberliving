"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

export async function getNotifications() {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { error: error.message, notifications: [] };
  return { notifications: data ?? [] };
}

export async function getUnreadCount() {
  const user = await requireAuth();
  const supabase = await createClient();

  // Cap at 99 — this powers unread-badge callers that only need
  // "some" / "up to 99+". Avoids the full-table COUNT aggregate a
  // `count: "exact"` head scan would do on users with long unread
  // histories.
  const CAP = 99;
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_read", false)
    .limit(CAP + 1);

  if (error) return 0;
  const n = data?.length ?? 0;
  return n > CAP ? CAP : n;
}

export async function markNotificationRead(notificationId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const user = await requireAuth();
  const supabase = await createClient();

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  revalidatePath("/notifications");
}

export async function deleteNotification(notificationId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", user.id);

  revalidatePath("/notifications");
}
