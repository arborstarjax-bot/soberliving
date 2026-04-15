import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { getDaysSober } from "@/lib/milestones";
import { CreateUserDialog } from "../users/create-user-dialog";
import { ResidentsTabs } from "./residents-tabs";

export default async function ResidentsPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const isAdmin = user.role === "admin";
  const isStaff = user.role === "admin" || user.role === "manager";

  // Fetch residents
  let query = supabase
    .from("residents")
    .select(
      "id, full_name, status, move_in_date, sobriety_date, house_id, houses(name)"
    )
    .order("full_name");

  if (houseFilter) {
    query = query.in("house_id", houseFilter);
  }

  const { data: residents } = await query;

  // Fetch houses
  let housesQuery = supabase
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) {
    housesQuery = housesQuery.in("id", houseFilter);
  }
  const { data: houses } = await housesQuery;

  // Fetch staff users (admins + managers) with house assignments
  type RawStaffUser = {
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

  let rawStaffUsers: RawStaffUser[] = [];
  if (isStaff) {
    const { data } = await supabase
      .from("users")
      .select(
        "id, full_name, email, is_active, user_roles(role), manager_house_assignments(house_id, houses(name), unassigned_at)"
      )
      .order("full_name");
    rawStaffUsers = (data as RawStaffUser[] | null) ?? [];
  }

  // Normalize residents for the tabs component
  const normalizedResidents = (residents ?? []).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    status: r.status,
    move_in_date: r.move_in_date,
    sobriety_date: r.sobriety_date,
    house_id: r.house_id,
    house_name:
      (r.houses as unknown as { name: string } | null)?.name ?? "Unknown",
    days_sober: r.sobriety_date ? getDaysSober(r.sobriety_date) : null,
  }));

  // Normalize staff users — only admins and managers
  const normalizedStaff = rawStaffUsers
    .filter((u) => {
      const role = u.user_roles?.[0]?.role ?? "resident";
      return role === "admin" || role === "manager";
    })
    .map((u) => {
      const role = u.user_roles?.[0]?.role ?? "resident";
      const activeAssignments = (u.manager_house_assignments ?? []).filter(
        (a) => !a.unassigned_at
      );
      const matchingResident = normalizedResidents.find(
        (r) => r.full_name === u.full_name
      );
      return {
        id: u.id,
        user_id: u.id,
        full_name: u.full_name,
        email: u.email,
        role,
        is_active: u.is_active,
        assigned_house_ids: activeAssignments.map((a) => a.house_id),
        assigned_house_names: activeAssignments
          .map((a) => a.houses?.name ?? "")
          .filter(Boolean),
        is_also_resident: !!matchingResident,
        resident_id: matchingResident?.id ?? null,
      };
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Residents</h1>
          <p className="text-muted-foreground">
            {normalizedResidents.filter((r) => r.status === "active").length}{" "}
            active residents
          </p>
        </div>
        {isStaff && <CreateUserDialog />}
      </div>

      <ResidentsTabs
        houses={houses ?? []}
        residents={normalizedResidents}
        staffUsers={normalizedStaff}
        isAdmin={isAdmin}
        isStaff={isStaff}
      />
    </div>
  );
}
