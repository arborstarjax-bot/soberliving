import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NotificationList } from "./notification-list";

export default async function NotificationsPage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-muted-foreground">
          {(notifications ?? []).filter((n) => !n.is_read).length} unread
        </p>
      </div>
      <NotificationList notifications={notifications ?? []} />
    </div>
  );
}
