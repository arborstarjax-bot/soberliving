import { requireAuth } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getPageParams, buildPaginationMeta } from "@/lib/pagination";
import { NotificationList } from "./notification-list";
import { RefreshOnMount } from "@/components/refresh-on-mount";
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

  // Auto-clear the sidebar badge as soon as the user opens this
  // page — "viewing the notifications" is the read event. Running
  // this before the list query means the rendered rows already
  // reflect their new is_read state so the per-row styling stays
  // in sync with the badge. Per-row "Mark as read" and the header
  // "Mark all read" button become no-ops after this pass but we
  // leave them in place for explicit undo / clean-up flows.
  // Router cache invalidation happens via `<RefreshOnMount />` below —
  // revalidatePath is forbidden inside a page's render in Next.js 16
  // ("Server Functions and Route Handlers" only). router.refresh on
  // mount drops the cached layout on the client and re-fetches this
  // route, which causes the sidebar's unread badge to re-render with
  // the new zero count.
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  // Unread count is always a full-dataset metric — it shouldn't change
  // as you page through. Keep it cheap with head-only count. After
  // the auto-mark above this is effectively always 0 on first render,
  // but we keep the query so the rest of the page's logic stays
  // defensive if the update ever fails.
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

  // Same pattern for chore signoffs: batch-load the current status of
  // every chore_submitted notification on this page so the inline
  // Approve/Reject controls flip to the lifecycle line as soon as a
  // decision has been made (here, the calendar, or another reviewer).
  const signoffIds = Array.from(
    new Set(
      (notifications ?? [])
        .filter(
          (n) =>
            n.type === "chore_submitted" &&
            n.entity_type === "chore_signoff" &&
            n.entity_id
        )
        .map((n) => n.entity_id as string)
    )
  );
  const signoffStatusMap: Record<
    string,
    {
      status: string;
      reviewer_name: string | null;
      reviewed_at: string | null;
      rejection_note: string | null;
    }
  > = {};
  if (signoffIds.length > 0) {
    const { data: signoffs } = await supabase
      .from("chore_signoffs")
      .select(
        "id, status, reviewed_at, rejection_note, reviewer:users!reviewed_by(full_name)"
      )
      .in("id", signoffIds);
    for (const s of signoffs ?? []) {
      const reviewer = (
        s as unknown as { reviewer: { full_name: string } | null }
      ).reviewer;
      signoffStatusMap[s.id as string] = {
        status: s.status as string,
        reviewer_name: reviewer?.full_name ?? null,
        reviewed_at: (s.reviewed_at as string | null) ?? null,
        rejection_note: (s.rejection_note as string | null) ?? null,
      };
    }
  }

  return (
    <div className="space-y-6">
      <RefreshOnMount />
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
        signoffStatusMap={signoffStatusMap}
        viewerRole={user.role}
      />
    </div>
  );
}
