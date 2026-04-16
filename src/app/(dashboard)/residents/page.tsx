import { requireAuth } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { getDaysSober } from "@/lib/milestones";
import { CreateUserDialog } from "../users/create-user-dialog";
import { ResidentsTabs } from "./residents-tabs";
import { getCheckInBatches } from "../check-ins/actions";

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
      "id, full_name, status, move_in_date, sobriety_date, house_id, user_id, houses(name)"
    )
    .order("full_name");

  if (houseFilter) {
    query = query.in("house_id", houseFilter);
  }

  const { data: residents } = await query;

  // Fetch houses (with address for intake review form)
  let housesQuery = supabase
    .from("houses")
    .select("id, name, address")
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
    user_roles: { role: string } | Array<{ role: string }> | null;
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
    user_id: (r as Record<string, unknown>).user_id as string | null,
    house_name:
      (r.houses as unknown as { name: string } | null)?.name ?? "Unknown",
    days_sober: r.sobriety_date ? getDaysSober(r.sobriety_date) : null,
  }));

  // Normalize staff users — only admins and managers
  const normalizedStaff = rawStaffUsers
    .filter((u) => {
      const roles = u.user_roles;
      const role = Array.isArray(roles) ? roles[0]?.role : roles?.role;
      return role === "admin" || role === "manager";
    })
    .map((u) => {
      const roles = u.user_roles;
      const role = (Array.isArray(roles) ? roles[0]?.role : roles?.role) ?? "resident";
      const activeAssignments = (u.manager_house_assignments ?? []).filter(
        (a) => !a.unassigned_at
      );
      const matchingResident = normalizedResidents.find(
        (r) => r.user_id === u.id
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

  // Fetch intake data for staff (pending reviews + awaiting signatures)
  let intakePending: Array<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    created_at: string;
    intakeFormData: Record<string, unknown>;
    completedAt: string | null;
  }> = [];
  let intakeAwaiting: Array<{
    id: string;
    full_name: string;
    email: string;
  }> = [];

  if (isStaff) {
    const adminClient = createAdminClient();

    // Get users who completed intake but don't have commitment_signed
    const { data: intakeUsers } = await adminClient
      .from("users")
      .select("id, full_name, email, phone, intake_completed, commitment_signed, is_active, created_at")
      .eq("intake_completed", true)
      .eq("commitment_signed", false)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const intakeUserIds = (intakeUsers ?? []).map((u) => u.id);
    const { data: existingCommitments } = await adminClient
      .from("house_commitments")
      .select("user_id, status")
      .in("user_id", intakeUserIds.length > 0 ? intakeUserIds : ["none"]);

    const usersWithCommitments = new Set(
      (existingCommitments ?? []).map((c) => c.user_id)
    );

    const pendingUsers = (intakeUsers ?? []).filter((u) => !usersWithCommitments.has(u.id));
    const awaitingSignature = (existingCommitments ?? [])
      .filter((c) => c.status === "pending_resident_signature")
      .map((c) => c.user_id);
    const awaitingUsers = (intakeUsers ?? []).filter((u) => awaitingSignature.includes(u.id));

    // Get intake form data for pending users
    const pendingIds = pendingUsers.map((u) => u.id);
    const { data: intakeForms } = await adminClient
      .from("intake_forms")
      .select("user_id, form_data, completed_at")
      .in("user_id", pendingIds.length > 0 ? pendingIds : ["none"])
      .eq("status", "completed");

    const intakeMap = new Map(
      (intakeForms ?? []).map((f) => [f.user_id, f])
    );

    intakePending = pendingUsers.map((u) => {
      const intake = intakeMap.get(u.id);
      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone ?? null,
        created_at: u.created_at,
        intakeFormData: (intake?.form_data ?? {}) as Record<string, unknown>,
        completedAt: intake?.completed_at ?? null,
      };
    });

    intakeAwaiting = awaitingUsers.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
    }));
  }

  // Fetch check-in batches for staff
  let checkInBatches: Array<{
    id: string;
    createdBy: string;
    houseNames: string;
    houseIds: string[];
    createdAt: string;
    completedCount: number;
    totalCount: number;
    responses: Array<{
      id: string;
      residentName: string;
      status: string;
      completedAt: string | null;
      formData: Record<string, unknown> | null;
      hasStaffSignature: boolean;
      houseId: string;
    }>;
  }> = [];

  if (isStaff) {
    const result = await getCheckInBatches();
    checkInBatches = result.batches ?? [];
  }

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
        {isStaff && <CreateUserDialog houses={houses ?? []} />}
      </div>

      <ResidentsTabs
        houses={houses ?? []}
        residents={normalizedResidents}
        staffUsers={normalizedStaff}
        isAdmin={isAdmin}
        isStaff={isStaff}
        intakePending={intakePending}
        intakeAwaiting={intakeAwaiting}
        checkInBatches={checkInBatches}
      />
    </div>
  );
}
