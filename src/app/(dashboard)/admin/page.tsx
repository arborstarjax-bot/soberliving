import { requireAuth } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { AdminTabs } from "./admin-tabs";

export default async function AdminPage() {
  const user = await requireAuth();

  // Only admin and manager can access admin panel
  if (user.role === "resident") {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const isAdmin = user.role === "admin";

  // All queries on this page are independent — run them in parallel so
  // the admin dashboard's first byte is bounded by the slowest single
  // query instead of the sum of all of them.

  // --- Houses ---
  let housesQuery = supabase
    .from("houses")
    .select("id, name, address, phone, capacity, is_active")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) housesQuery = housesQuery.in("id", houseFilter);

  // --- Residents ---
  let residentsQuery = supabase
    .from("residents")
    .select("id, full_name, house_id, status, phone, email, move_in_date, sobriety_date")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);

  // --- Rooms & Beds for bed assignment ---
  let roomsQuery = supabase
    .from("rooms")
    .select("id, house_id, name, beds(id, label, is_active)")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) roomsQuery = roomsQuery.in("house_id", houseFilter);

  // --- Active bed assignments ---
  const bedAssignmentsQuery = supabase
    .from("bed_assignments")
    .select("id, resident_id, bed_id, start_date")
    .is("end_date", null);

  // --- Chores with tasks ---
  let choresQuery = supabase
    .from("chores")
    .select("*, chore_tasks(*)")
    .eq("is_active", true)
    .order("sort_order");
  if (houseFilter) choresQuery = choresQuery.in("house_id", houseFilter);

  // --- Current rotations ---
  let rotationsQuery = supabase
    .from("chore_rotations")
    .select(
      "*, chore_rotation_assignments(*, chore:chores(id, name), resident:residents(id, full_name), chore_signoffs(*))"
    )
    .eq("is_current", true);
  if (houseFilter) rotationsQuery = rotationsQuery.in("house_id", houseFilter);

  // --- Pending signoffs ---
  const pendingSignoffsQuery = supabase
    .from("chore_signoffs")
    .select(
      "*, rotation_assignment:chore_rotation_assignments(resident:residents(full_name), chore:chores(name, house_id))"
    )
    .eq("status", "completed_pending_review")
    .order("sign_off_date", { ascending: true });

  // --- Leave Requests (pending) ---
  const leaveQuery = supabase
    .from("leave_requests")
    .select("*, resident:residents(id, full_name, house_id, houses(name))")
    .in("status", ["pending_cover", "pending_manager", "pending_admin"])
    .order("created_at", { ascending: false });

  // --- Demerits ---
  let demeritsQuery = supabase
    .from("demerits")
    .select("*, resident:residents(full_name), house:houses(name), issuer:users!issued_by(full_name)")
    .order("created_at", { ascending: false });
  if (houseFilter) demeritsQuery = demeritsQuery.in("house_id", houseFilter);

  // --- Incidents ---
  let incidentsQuery = supabase
    .from("incidents")
    .select("*, resident:residents(full_name), house:houses(name), reporter:users!reported_by(full_name)")
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (houseFilter) incidentsQuery = incidentsQuery.in("house_id", houseFilter);

  // --- Users (admin only) ---
  type AdminUser = {
    id: string;
    full_name: string;
    email: string;
    is_active: boolean;
    user_roles: Array<{ role: string }>;
    manager_house_assignments: Array<{
      house_id: string;
      houses: { name: string } | null;
      unassigned_at: string | null;
    }>;
  };
  const usersQuery = isAdmin
    ? supabase
        .from("users")
        .select("id, full_name, email, is_active, user_roles(role), manager_house_assignments(house_id, houses(name), unassigned_at)")
        .order("full_name")
    : null;

  // --- Pending payments ---
  let pendingPaymentsQuery = supabase
    .from("payments")
    .select("*, resident:residents(full_name), house:houses(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (houseFilter) pendingPaymentsQuery = pendingPaymentsQuery.in("house_id", houseFilter);

  // --- Recent completed payments ---
  let recentPaymentsQuery = supabase
    .from("payments")
    .select("*, resident:residents(full_name), house:houses(name)")
    .eq("status", "completed")
    .order("paid_at", { ascending: false })
    .limit(10);
  if (houseFilter) recentPaymentsQuery = recentPaymentsQuery.in("house_id", houseFilter);

  const [
    { data: houses },
    { data: residents },
    { data: rooms },
    { data: bedAssignments },
    { data: chores },
    { data: rotations },
    { data: pendingSignoffs },
    { data: allPendingLeave },
    { data: demerits },
    { data: incidents },
    usersRes,
    { data: pendingPayments },
    { data: recentPayments },
  ] = await Promise.all([
    housesQuery,
    residentsQuery,
    roomsQuery,
    bedAssignmentsQuery,
    choresQuery,
    rotationsQuery,
    pendingSignoffsQuery,
    leaveQuery,
    demeritsQuery,
    incidentsQuery,
    usersQuery ? usersQuery : Promise.resolve({ data: null as AdminUser[] | null }),
    pendingPaymentsQuery,
    recentPaymentsQuery,
  ]);

  let filteredPendingSignoffs = pendingSignoffs ?? [];
  if (houseFilter) {
    filteredPendingSignoffs = filteredPendingSignoffs.filter((s) => {
      const ra = s.rotation_assignment as { chore: { house_id: string } };
      return houseFilter.includes(ra?.chore?.house_id);
    });
  }

  let pendingLeave = allPendingLeave ?? [];
  if (houseFilter) {
    pendingLeave = pendingLeave.filter((r) =>
      houseFilter.includes(
        (r.resident as { house_id: string })?.house_id
      )
    );
  }

  const users: AdminUser[] = (usersRes.data as unknown as AdminUser[] | null) ?? [];

  // Occupied beds set for quick lookup
  const occupiedBedIds = new Set(
    (bedAssignments ?? []).map((a) => a.bed_id)
  );

  // Build rooms with availability info
  const roomsWithAvailability = (rooms ?? []).map((room) => ({
    ...room,
    beds: ((room.beds as Array<{ id: string; label: string; is_active: boolean }>) ?? [])
      .filter((b) => b.is_active)
      .map((bed) => ({
        ...bed,
        is_occupied: occupiedBedIds.has(bed.id),
      })),
  }));

  const activeDemerits = (demerits ?? []).filter((d) => d.status === "active");

  // --- Pending intake applications (admin only) ---
  // Mirror the intake-review page's "Pending" partition: applicant has
  // submitted intake but has NOT been reviewed yet (no house_commitments
  // row). Users who already have a commitment are in the Approved tab
  // waiting for their signature — they should not bump this banner count.
  let pendingIntakeCount = 0;
  if (isAdmin) {
    const adminClient = createAdminClient();
    const [{ data: intakeUsers }, { data: commitments }] = await Promise.all([
      adminClient
        .from("users")
        .select("id")
        .eq("intake_completed", true)
        .eq("commitment_signed", false)
        .eq("is_active", true)
        .neq("account_status", "rejected"),
      adminClient.from("house_commitments").select("user_id"),
    ]);
    const reviewedUserIds = new Set(
      (commitments ?? []).map((c) => c.user_id as string)
    );
    pendingIntakeCount = (intakeUsers ?? []).filter(
      (u) => !reviewedUserIds.has(u.id as string)
    ).length;
  }

  return (
    <>
      {isAdmin && pendingIntakeCount > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            <span className="text-sm">
              {pendingIntakeCount} intake application
              {pendingIntakeCount === 1 ? "" : "s"} waiting for review.
            </span>
          </div>
          <Link
            href="/intake-review"
            className="text-sm font-medium underline underline-offset-2"
          >
            Review
          </Link>
        </div>
      )}
      <AdminTabs
      isAdmin={isAdmin}
      houses={houses ?? []}
      residents={residents ?? []}
      rooms={roomsWithAvailability}
      chores={(chores ?? []).map((c) => ({
        ...c,
        tasks: ((c.chore_tasks ?? []) as Array<{ id: string; description: string; sort_order: number; is_active: boolean }>)
          .filter((t) => t.is_active)
          .sort((a, b) => a.sort_order - b.sort_order),
      }))}
      rotations={rotations ?? []}
      pendingSignoffs={filteredPendingSignoffs}
      pendingLeave={pendingLeave}
      demerits={demerits ?? []}
      activeDemeritsCount={activeDemerits.length}
      incidents={incidents ?? []}
      users={users}
      pendingPayments={pendingPayments ?? []}
      recentPayments={recentPayments ?? []}
      />
    </>
  );
}
