import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { redirect } from "next/navigation";
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

  // --- Houses ---
  let housesQuery = supabase
    .from("houses")
    .select("id, name, address, phone, capacity, is_active")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) housesQuery = housesQuery.in("id", houseFilter);
  const { data: houses } = await housesQuery;

  // --- Residents ---
  let residentsQuery = supabase
    .from("residents")
    .select("id, full_name, house_id, status, phone, email, move_in_date, sobriety_date")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);
  const { data: residents } = await residentsQuery;

  // --- Rooms & Beds for bed assignment ---
  let roomsQuery = supabase
    .from("rooms")
    .select("id, house_id, name, beds(id, label, is_active)")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) roomsQuery = roomsQuery.in("house_id", houseFilter);
  const { data: rooms } = await roomsQuery;

  // --- Active bed assignments ---
  const { data: bedAssignments } = await supabase
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
  const { data: chores } = await choresQuery;

  // --- Current rotations ---
  let rotationsQuery = supabase
    .from("chore_rotations")
    .select(
      "*, chore_rotation_assignments(*, chore:chores(id, name), resident:residents(id, full_name), chore_signoffs(*))"
    )
    .eq("is_current", true);
  if (houseFilter) rotationsQuery = rotationsQuery.in("house_id", houseFilter);
  const { data: rotations } = await rotationsQuery;

  // --- Pending signoffs ---
  const { data: pendingSignoffs } = await supabase
    .from("chore_signoffs")
    .select(
      "*, rotation_assignment:chore_rotation_assignments(resident:residents(full_name), chore:chores(name, house_id))"
    )
    .eq("status", "completed_pending_review")
    .order("sign_off_date", { ascending: true });

  let filteredPendingSignoffs = pendingSignoffs ?? [];
  if (houseFilter) {
    filteredPendingSignoffs = filteredPendingSignoffs.filter((s) => {
      const ra = s.rotation_assignment as { chore: { house_id: string } };
      return houseFilter.includes(ra?.chore?.house_id);
    });
  }

  // --- Leave Requests (pending) ---
  const leaveQuery = supabase
    .from("leave_requests")
    .select("*, resident:residents(id, full_name, house_id, houses(name))")
    .in("status", ["pending_cover", "pending_manager", "pending_admin"])
    .order("created_at", { ascending: false });
  const { data: allPendingLeave } = await leaveQuery;
  let pendingLeave = allPendingLeave ?? [];
  if (houseFilter) {
    pendingLeave = pendingLeave.filter((r) =>
      houseFilter.includes(
        (r.resident as { house_id: string })?.house_id
      )
    );
  }

  // --- Demerits ---
  let demeritsQuery = supabase
    .from("demerits")
    .select("*, resident:residents(full_name), house:houses(name), issuer:users!issued_by(full_name)")
    .order("created_at", { ascending: false });
  if (houseFilter) demeritsQuery = demeritsQuery.in("house_id", houseFilter);
  const { data: demerits } = await demeritsQuery;

  // --- Incidents ---
  let incidentsQuery = supabase
    .from("incidents")
    .select("*, resident:residents(full_name), house:houses(name), reporter:users!reported_by(full_name)")
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (houseFilter) incidentsQuery = incidentsQuery.in("house_id", houseFilter);
  const { data: incidents } = await incidentsQuery;

  // --- Users (admin only) ---
  let users: Array<{
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
  }> = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("users")
      .select("id, full_name, email, is_active, user_roles(role), manager_house_assignments(house_id, houses(name), unassigned_at)")
      .order("full_name");
    users = (data ?? []) as unknown as typeof users;
  }

  // --- Pending payments ---
  let pendingPaymentsQuery = supabase
    .from("payments")
    .select("*, resident:residents(full_name), house:houses(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (houseFilter) pendingPaymentsQuery = pendingPaymentsQuery.in("house_id", houseFilter);
  const { data: pendingPayments } = await pendingPaymentsQuery;

  // --- Recent completed payments ---
  let recentPaymentsQuery = supabase
    .from("payments")
    .select("*, resident:residents(full_name), house:houses(name)")
    .eq("status", "completed")
    .order("paid_at", { ascending: false })
    .limit(10);
  if (houseFilter) recentPaymentsQuery = recentPaymentsQuery.in("house_id", houseFilter);
  const { data: recentPayments } = await recentPaymentsQuery;

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

  return (
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
  );
}
