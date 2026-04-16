import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPageParams, buildPaginationMeta } from "@/lib/pagination";
import { NotificationList } from "./notification-list";
import {
  NOTIFICATION_CATEGORIES,
  notificationTypesForCategory,
  allMappedNotificationTypes,
} from "./categories";

function normalizeTab(
  raw: string | string[] | undefined
): (typeof NOTIFICATION_CATEGORIES)[number] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "All";
  const match = NOTIFICATION_CATEGORIES.find(
    (c) => c.toLowerCase() === value.toLowerCase()
  );
  return match ?? "All";
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const user = await requireAuth();
  const supabase = await createClient();

  const params = await searchParams;
  const activeTab = normalizeTab(params.tab);
  const { page, offset, pageSize } = getPageParams(params);

  // Unread count is always a full-dataset metric — it shouldn't change
  // as you page through. Keep it cheap with head-only count.
  const unreadRes = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Apply the category filter server-side so per-tab pagination counts
  // reflect only the filtered subset. "Other" is "type NOT IN mapped".
  if (activeTab !== "All") {
    if (activeTab === "Other") {
      const mapped = allMappedNotificationTypes();
      if (mapped.length > 0) {
        query = query.not("type", "in", `(${mapped.join(",")})`);
      }
    } else {
      const types = notificationTypesForCategory(activeTab);
      if (types.length > 0) {
        query = query.in("type", types);
      } else {
        query = query.eq("type", "__never__");
      }
    }
  }

  const { data: notifications, count } = await query.range(
    offset,
    offset + pageSize - 1
  );

  const meta = buildPaginationMeta(count ?? 0, page, pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-muted-foreground">
          {unreadRes.count ?? 0} unread
        </p>
      </div>
      <NotificationList
        notifications={notifications ?? []}
        activeTab={activeTab}
        meta={meta}
        searchParams={params}
      />
    </div>
  );
}
