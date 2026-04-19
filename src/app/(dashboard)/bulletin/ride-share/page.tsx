import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { NewRideForm } from "./new-ride-form";
import { RideList } from "./ride-list";

interface RideSharePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RideSharePage({
  searchParams,
}: RideSharePageProps) {
  const user = await requireAuth();
  const admin = createAdminClient();
  const params = await searchParams;
  const showPast = params.past === "1";

  // Houses the user can post for. Residents can post only to their
  // active house; managers to assigned houses; admins to any active
  // house. Mirrors bulletin Posts tab.
  let postableHouses: { id: string; name: string }[] = [];
  let myHouseId: string | null = null;
  if (user.role === "admin") {
    const { data } = await admin
      .from("houses")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    postableHouses = data ?? [];
  } else if (user.role === "manager") {
    if (user.assigned_house_ids.length > 0) {
      const { data } = await admin
        .from("houses")
        .select("id, name")
        .in("id", user.assigned_house_ids)
        .eq("is_active", true)
        .order("name");
      postableHouses = data ?? [];
    }
  } else {
    const { data: resident } = await admin
      .from("residents")
      .select("house_id, house:houses!inner(id, name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (resident) {
      const house = resident.house as unknown as { id: string; name: string };
      postableHouses = [{ id: house.id, name: house.name }];
      myHouseId = house.id;
    }
  }

  // Visible house ids — same logic as the Posts tab. Ride shares are
  // always scoped to a single house (no NULL house_id), unlike
  // bulletin posts.
  let visibleHouseIds: string[] | null = null; // null = all
  if (user.role === "resident") {
    visibleHouseIds = myHouseId ? [myHouseId] : [];
  } else if (user.role === "manager") {
    visibleHouseIds =
      user.assigned_house_ids.length > 0 ? user.assigned_house_ids : [];
  }

  // Fetch ride shares: join ride_shares -> bulletin_posts for house +
  // author. We filter the inner bulletin_posts by post_type and house.
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
    .order("departure_at", { ascending: true });

  if (visibleHouseIds && visibleHouseIds.length > 0) {
    query = query.in("bulletin_posts.house_id", visibleHouseIds);
  } else if (visibleHouseIds) {
    // Empty array = user has access to no houses → no rides.
    return (
      <EmptyState
        userCanCreate={false}
        postableHouses={[]}
      />
    );
  }

  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const nowMs = nowDate.getTime();
  if (!showPast) {
    query = query.gte("departure_at", nowIso);
  }

  const { data: rows, error } = await query;
  if (error) {
    return (
      <div className="rounded-xl border bg-red-50 border-red-200 p-4 text-sm text-red-700">
        Failed to load rides: {error.message}
      </div>
    );
  }

  const postIds = (rows ?? []).map((r) => r.post_id as string);
  const reservationsByPost: Record<string, { user_id: string; name: string }[]> =
    {};
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
      if (uid === user.id) myReservations.add(pid);
    }
  }

  const rides = (rows ?? []).map((r) => {
    const bp = Array.isArray(r.bulletin_posts)
      ? (r.bulletin_posts as unknown as Array<Record<string, unknown>>)[0]
      : (r.bulletin_posts as unknown as Record<string, unknown>);
    type AuthorShape = {
      full_name: string;
      user_roles: Array<{ role: string }> | { role: string } | null;
      residents:
        | Array<{ sobriety_date: string | null; status: string | null }>
        | { sobriety_date: string | null; status: string | null }
        | null;
    };
    const authorRaw = bp.author as AuthorShape | Array<AuthorShape> | null;
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
    const authorSobrietyDate =
      residentsList.find((r) => r?.status === "active")?.sobriety_date ?? null;
    const houseRaw = bp.house as
      | Array<{ name: string }>
      | { name: string }
      | null;
    const houseName = Array.isArray(houseRaw)
      ? houseRaw[0]?.name
      : (houseRaw as { name: string } | null)?.name;

    const pid = r.post_id as string;
    const reservations = reservationsByPost[pid] ?? [];
    const reservedCount = reservations.length;
    const seatsTotal = r.seats_total as number;
    const seatsLeft = Math.max(0, seatsTotal - reservedCount);
    const departureAt = r.departure_at as string;

    return {
      id: pid,
      author_id: bp.author_id as string,
      author_name: authorData?.full_name ?? "Unknown",
      author_role: authorRole,
      author_sobriety_date: authorSobrietyDate,
      house_id: bp.house_id as string,
      house_name: houseName ?? null,
      created_at: bp.created_at as string,
      destination_type: r.destination_type as
        | "meeting"
        | "church"
        | "store"
        | "other",
      destination_label: (r.destination_label as string | null) ?? null,
      seats_total: seatsTotal,
      seats_reserved: reservedCount,
      seats_left: seatsLeft,
      is_full: seatsLeft === 0,
      departure_at: departureAt,
      is_past: new Date(departureAt).getTime() < nowMs,
      notes: (bp.content as string) ?? "",
      reservations,
      user_has_reservation: myReservations.has(pid),
    };
  });

  return (
    <div className="space-y-6">
      <NewRideForm
        houses={postableHouses}
        singleHouse={user.role === "resident" && postableHouses.length === 1}
      />

      {user.role !== "resident" && (
        <PastToggle showPast={showPast} />
      )}

      <RideList
        rides={rides}
        currentUserId={user.id}
        currentUserRole={user.role}
      />
    </div>
  );
}

function EmptyState({
  userCanCreate,
  postableHouses,
}: {
  userCanCreate: boolean;
  postableHouses: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-6">
      {userCanCreate && postableHouses.length > 0 && (
        <NewRideForm
          houses={postableHouses}
          singleHouse={postableHouses.length === 1}
        />
      )}
      <div className="rounded-xl border bg-white shadow-sm p-12 text-center">
        <p className="text-muted-foreground text-sm">
          No ride shares to show.
        </p>
      </div>
    </div>
  );
}

function PastToggle({ showPast }: { showPast: boolean }) {
  return (
    <div className="flex items-center justify-end">
      <a
        href={showPast ? "/bulletin/ride-share" : "/bulletin/ride-share?past=1"}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        {showPast ? "Hide past rides" : "Show past rides"}
      </a>
    </div>
  );
}
