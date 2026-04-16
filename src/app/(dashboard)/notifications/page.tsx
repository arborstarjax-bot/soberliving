import { requireAuth } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
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

  // Batch-fetch the current status of every leave_request that any
  // actionable notification on this page links to. We use this to
  // replace stale Approve/Deny buttons on old notifications with a
  // resolved-state badge (e.g. "Already approved", "Denied") once the
  // underlying request has moved past that reviewer's stage.
  const leaveIds = Array.from(
    new Set(
      (notifications ?? [])
        .filter((n) => n.entity_type === "leave_request" && n.entity_id)
        .map((n) => n.entity_id as string)
    )
  );
  const leaveStatusMap: Record<
    string,
    { status: string; rejection_step: string | null }
  > = {};
  if (leaveIds.length > 0) {
    // Use the admin client here: cover_request notifications are
    // addressed to the covering resident, who has no RLS read access
    // to leave_requests (same reason approveCoverRequest uses the
    // admin client). With the RLS-scoped client, the query silently
    // returns no rows for those IDs, leaveStatusMap is empty, and the
    // covering resident's old notifications still render stale
    // Approve/Deny buttons instead of resolved-state badges. We only
    // read id/status/rejection_step for IDs that already appear in the
    // current user's notifications, so the scope matches the
    // notification rows they're already allowed to see.
    const adminClient = createAdminClient();
    const { data: leaves } = await adminClient
      .from("leave_requests")
      .select("id, status, rejection_step")
      .in("id", leaveIds);
    for (const l of leaves ?? []) {
      leaveStatusMap[l.id as string] = {
        status: l.status as string,
        rejection_step: (l.rejection_step as string | null) ?? null,
      };
    }
  }

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
        leaveStatusMap={leaveStatusMap}
      />
    </div>
  );
}
