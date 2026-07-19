import { createAdminClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

const CAP = 99;

/**
 * Async server component that renders the unread-bulletin badge for
 * the sidebar. Mirrors the visibility scope used in bulletin/page.tsx
 * (own-house + global for residents, assigned houses + global for
 * managers, all for admins).
 *
 * Uses a CAP+1 row fetch instead of `count: "exact"` — a user who
 * hasn't opened Community Services in months could otherwise trigger
 * a full-table count scan on every navigation.
 *
 * Rendered inside `<Suspense fallback={null}>` in the dashboard
 * layout so the sidebar paints immediately while this streams.
 */
export async function BulletinBadge({
  userId,
  userRole,
  assignedHouseIds,
  workspaceId,
}: {
  userId: string;
  userRole: UserRole;
  assignedHouseIds: string[];
  workspaceId: string | null;
}) {
  const adminClient = createAdminClient();

  // Resident scope requires a live house_id lookup (residents can be
  // reassigned or discharged between logins). Run it in parallel with
  // the last_seen fetch so the two round-trips overlap.
  const [meRes, residentRes] = await Promise.all([
    adminClient
      .from("users")
      .select("last_seen_bulletin_at")
      .eq("id", userId)
      .maybeSingle(),
    userRole === "resident"
      ? adminClient
          .from("residents")
          .select("house_id")
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const lastSeen =
    (meRes.data?.last_seen_bulletin_at as string | null) ?? null;

  let visibleHouseIds: string[] | null = null; // null = all houses
  if (userRole === "resident") {
    const houseId = (residentRes.data as { house_id?: string } | null)
      ?.house_id;
    visibleHouseIds = houseId ? [houseId] : [];
  } else if (userRole === "manager") {
    visibleHouseIds = assignedHouseIds.length > 0 ? assignedHouseIds : [];
  }

  let q = adminClient.from("bulletin_posts").select("id").limit(CAP + 1);
  if (lastSeen) q = q.gt("created_at", lastSeen);
  // Workspace scope so an admin's unread count never includes other
  // workspaces' posts.
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (visibleHouseIds && visibleHouseIds.length > 0) {
    q = q.or(`house_id.in.(${visibleHouseIds.join(",")}),house_id.is.null`);
  } else if (visibleHouseIds) {
    q = q.is("house_id", null);
  }

  const { data } = await q;
  const n = data?.length ?? 0;
  if (n === 0) return null;

  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
      {n > CAP ? `${CAP}+` : n}
    </span>
  );
}
