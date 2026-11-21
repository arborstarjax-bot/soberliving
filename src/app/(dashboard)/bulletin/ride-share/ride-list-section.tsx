import { createAdminClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { CursorPager } from "@/components/cursor-pager";
import {
  DEFAULT_PAGE_SIZE,
  applyCursor,
  buildCursorHref,
  encodeCursor,
  parseCursor,
  sliceForPage,
  type Cursor,
} from "@/lib/cursor";
import { RideList } from "./ride-list";

type AuthorShape = {
  full_name: string;
  user_roles: Array<{ role: string }> | { role: string } | null;
  residents:
    | Array<{ sobriety_date: string | null; status: string | null }>
    | { sobriety_date: string | null; status: string | null }
    | null;
};

/**
 * Heavy ride-share data fetch + pagination. Rendered inside a
 * `<Suspense>` boundary by `page.tsx` so the shell (form + past
 * toggle) paints immediately while this streams in.
 *
 * Upcoming rides are sorted ascending by `(departure_at, post_id)`
 * — the soonest trip first. Cursor is applied with
 * `direction: "asc"` so "Next" pages forward in time.
 */
export interface RideListSectionProps {
  currentUserId: string;
  currentUserRole: UserRole;
  visibleHouseIds: string[] | null;
  workspaceId: string | null;
  showPast: boolean;
  searchParams: Record<string, string | string[] | undefined>;
}

export async function RideListSection({
  currentUserId,
  currentUserRole,
  visibleHouseIds,
  workspaceId,
  showPast,
  searchParams,
}: RideListSectionProps) {
  // Empty visible list → user has no assignments, render empty state.
  if (visibleHouseIds && visibleHouseIds.length === 0) {
    return (
      <div className="rounded-xl border bg-white shadow-sm p-12 text-center">
        <p className="text-muted-foreground text-sm">
          No ride shares to show.
        </p>
      </div>
    );
  }

  const admin = createAdminClient();
  const cursor = parseCursor(searchParams.c);

  let query = admin
    .from("ride_shares")
    .select(
      `post_id,
       destination_type,
       destination_label,
       seats_total,
       departure_at,
       bulletin_posts!inner(
         id,
         author_id,
         content,
         house_id,
         created_at,
         post_type,
         author:users!author_id(full_name, user_roles(role), residents(sobriety_date, status)),
         house:houses(name)
       )`
    )
    .eq("bulletin_posts.post_type", "ride_share")
    .order("departure_at", { ascending: true })
    .order("post_id", { ascending: true })
    .limit(DEFAULT_PAGE_SIZE + 1);

  // Workspace scope: an admin has visibleHouseIds === null, so without
  // this filter they'd see every workspace's rides.
  if (workspaceId) {
    query = query.eq("bulletin_posts.workspace_id", workspaceId);
  }

  if (visibleHouseIds && visibleHouseIds.length > 0) {
    query = query.in("bulletin_posts.house_id", visibleHouseIds);
  }

  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const nowMs = nowDate.getTime();
  if (!showPast) {
    query = query.gte("departure_at", nowIso);
  }

  query = applyCursor(query, cursor, {
    tsColumn: "departure_at",
    idColumn: "post_id",
    direction: "asc",
  });

  const { data: rawRows, error } = await query;
  if (error) {
    return (
      <div className="rounded-xl border bg-red-50 border-red-200 p-4 text-sm text-red-700">
        Failed to load rides: {error.message}
      </div>
    );
  }

  type RawRideRow = {
    post_id: string;
    destination_type: "meeting" | "church" | "store" | "other";
    destination_label: string | null;
    seats_total: number;
    departure_at: string;
    bulletin_posts:
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | null;
  };
  const allRows = (rawRows ?? []) as unknown as RawRideRow[];
  const { rows, nextCursor } = sliceForPage<RawRideRow>(
    allRows,
    DEFAULT_PAGE_SIZE,
    (r) => ({ ts: r.departure_at, id: r.post_id })
  );

  const postIds = rows.map((r) => r.post_id);
  const reservationsByPost: Record<
    string,
    { user_id: string; name: string }[]
  > = {};
  const myReservations = new Set<string>();
  if (postIds.length > 0) {
    const { data: resRows } = await admin
      .from("ride_share_reservations")
      .select("post_id, user_id, user:users!user_id(full_name)")
      .in("post_id", postIds);
    for (const row of resRows ?? []) {
      const pid = row.post_id as string;
      const uid = row.user_id as string;
      const userRow = Array.isArray(row.user)
        ? (row.user as Array<{ full_name: string }>)[0]
        : (row.user as { full_name: string } | null);
      const name = userRow?.full_name ?? "Someone";
      if (!reservationsByPost[pid]) reservationsByPost[pid] = [];
      reservationsByPost[pid].push({ user_id: uid, name });
      if (uid === currentUserId) myReservations.add(pid);
    }
  }

  const rides = rows.map((r) => {
    const bp = Array.isArray(r.bulletin_posts)
      ? r.bulletin_posts[0]
      : r.bulletin_posts;
    const authorRaw = (bp?.author ?? null) as
      | AuthorShape
      | Array<AuthorShape>
      | null;
    const authorData = Array.isArray(authorRaw) ? authorRaw[0] : authorRaw;
    const roleRaw = authorData?.user_roles;
    const authorRole = Array.isArray(roleRaw)
      ? roleRaw[0]?.role ?? "resident"
      : (roleRaw as { role: string } | null)?.role ?? "resident";
    const residentsRaw = authorData?.residents;
    const residentsList = Array.isArray(residentsRaw)
      ? residentsRaw
      : residentsRaw
        ? [residentsRaw]
        : [];
    // Any active residents row wins — staff who are themselves in
    // recovery should still show their sobriety tier. `status`
    // already filters out archived / discharged legacy rows.
    const authorSobrietyDate =
      residentsList.find((x) => x?.status === "active")?.sobriety_date ??
      null;
    const houseRaw = (bp?.house ?? null) as
      | Array<{ name: string }>
      | { name: string }
      | null;
    const houseName = Array.isArray(houseRaw)
      ? houseRaw[0]?.name
      : (houseRaw as { name: string } | null)?.name;

    const pid = r.post_id;
    const reservations = reservationsByPost[pid] ?? [];
    const reservedCount = reservations.length;
    const seatsTotal = r.seats_total;
    const seatsLeft = Math.max(0, seatsTotal - reservedCount);
    const departureAt = r.departure_at;

    return {
      id: pid,
      author_id: (bp?.author_id as string) ?? "",
      author_name: authorData?.full_name ?? "Unknown",
      author_role: authorRole,
      author_sobriety_date: authorSobrietyDate,
      house_id: (bp?.house_id as string) ?? "",
      house_name: houseName ?? null,
      created_at: (bp?.created_at as string) ?? "",
      destination_type: r.destination_type,
      destination_label: r.destination_label ?? null,
      seats_total: seatsTotal,
      seats_reserved: reservedCount,
      seats_left: seatsLeft,
      is_full: seatsLeft === 0,
      departure_at: departureAt,
      is_past: new Date(departureAt).getTime() < nowMs,
      notes: (bp?.content as string) ?? "",
      reservations,
      user_has_reservation: myReservations.has(pid),
    };
  });

  // Cursor-stack back navigation (same pattern as the bulletin feed).
  const cpRaw = searchParams.cp;
  const cpList: string[] = Array.isArray(cpRaw)
    ? cpRaw.filter(Boolean)
    : cpRaw
      ? cpRaw.split(",").filter(Boolean)
      : [];

  const buildPrevHref = () => {
    if (!cursor) return null;
    if (cpList.length === 0) {
      return buildCursorHref(
        "/bulletin/ride-share",
        { ...searchParams, cp: undefined, c: undefined },
        null,
        "c"
      );
    }
    const newCpList = cpList.slice(0, -1);
    const prevCursorEnc = cpList[cpList.length - 1] ?? null;
    const prevCursor = prevCursorEnc ? parseCursor(prevCursorEnc) : null;
    return buildCursorHref(
      "/bulletin/ride-share",
      {
        ...searchParams,
        cp: newCpList.length ? newCpList.join(",") : undefined,
      },
      prevCursor,
      "c"
    );
  };

  const buildNextHref = (nc: Cursor | null) => {
    if (!nc) return null;
    const newCpList = cursor ? [...cpList, encodeCursor(cursor)] : cpList;
    return buildCursorHref(
      "/bulletin/ride-share",
      {
        ...searchParams,
        cp: newCpList.length ? newCpList.join(",") : undefined,
      },
      nc,
      "c"
    );
  };

  const prevHref = buildPrevHref();
  const nextHref = buildNextHref(nextCursor);

  return (
    <div className="space-y-4">
      {rides.length === 0 ? (
        <div className="rounded-xl border bg-white shadow-sm p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {showPast ? "No past rides." : "No upcoming rides."}
          </p>
        </div>
      ) : (
        <RideList
          rides={rides}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />
      )}
      <CursorPager
        prevHref={prevHref}
        nextHref={nextHref}
        itemLabel="rides"
      />
    </div>
  );
}
