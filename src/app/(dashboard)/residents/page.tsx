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

  // Build the independent top-level queries. Residents, houses, staff
  // roster, the intake users list, and the check-in batches are all
  // independent — fire them in parallel so the page isn't bounded by
  // the sum of their latencies.
  let residentsQuery = supabase
    .from("residents")
    .select(
      "id, full_name, status, move_in_date, sobriety_date, house_id, user_id, houses(name)"
    )
    .order("full_name");
  if (houseFilter) {
    residentsQuery = residentsQuery.in("house_id", houseFilter);
  }

  let housesQuery = supabase
    .from("houses")
    .select("id, name, address")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) {
    housesQuery = housesQuery.in("id", houseFilter);
  }

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
  const staffQuery = isStaff
    ? supabase
        .from("users")
        .select(
          "id, full_name, email, is_active, user_roles(role), manager_house_assignments(house_id, houses(name), unassigned_at)"
        )
        .order("full_name")
    : null;

  const adminClient = isStaff ? createAdminClient() : null;
  const intakeUsersQuery = isStaff && adminClient
    ? adminClient
        .from("users")
        .select("id, full_name, email, phone, intake_completed, commitment_signed, is_active, account_status, denial_reason, denied_at, created_at")
        .eq("intake_completed", true)
        .eq("commitment_signed", false)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
    : null;

  const checkInBatchesPromise = isStaff ? getCheckInBatches() : null;

  const nullRes = Promise.resolve({ data: null });

  const [
    { data: residents },
    { data: houses },
    staffRes,
    intakeUsersRes,
    checkInBatchesResult,
  ] = await Promise.all([
    residentsQuery,
    housesQuery,
    staffQuery ?? nullRes,
    intakeUsersQuery ?? nullRes,
    checkInBatchesPromise ?? Promise.resolve(null),
  ]);

  const rawStaffUsers = (staffRes.data as RawStaffUser[] | null) ?? [];

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

  // Fetch intake data for staff (full lifecycle: invited, in progress,
  // awaiting review, awaiting signature, denied).
  let intakeInvited: Array<{
    id: string;
    full_name: string;
    email: string;
    createdAt: string;
  }> = [];
  let intakeInProgress: Array<{
    id: string;
    full_name: string;
    email: string;
    lastUpdatedAt: string | null;
  }> = [];
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
  let intakeDenied: Array<{
    id: string;
    full_name: string;
    email: string;
    denialReason: string | null;
    deniedAt: string | null;
  }> = [];

  if (isStaff && adminClient) {
    type IntakeUser = {
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      intake_completed: boolean;
      account_status: string | null;
      denial_reason: string | null;
      denied_at: string | null;
      created_at: string;
      user_roles: { role: string } | Array<{ role: string }> | null;
    };
    const rawIntakeUsers = (intakeUsersRes.data as IntakeUser[] | null) ?? [];
    // Only residents show up in the intake funnel — admins and managers
    // share the users table but should never appear here.
    const intakeUsers = rawIntakeUsers.filter((u) => {
      const roles = u.user_roles;
      const role = Array.isArray(roles) ? roles[0]?.role : roles?.role;
      return role === "resident" || role == null;
    });

    // Split denied out before any commitment/intake-form joins — they
    // don't need the review packet surfaced, just a "Denied" row with
    // Reopen for admins. This is what stops already-denied applicants
    // from reappearing in the Pending list and letting staff "re-deny"
    // them (which the server rejects with "already denied").
    const deniedUsers = intakeUsers.filter((u) => u.account_status === "rejected");
    const activeIntakeUsers = intakeUsers.filter(
      (u) => u.account_status !== "rejected"
    );
    const activeIntakeIds = activeIntakeUsers.map((u) => u.id);

    // Commitments and intake forms both key off the active intake ids,
    // but neither depends on the other. Fetch them in parallel.
    // We pull ALL intake-form rows (draft + completed) so we can tell
    // "still filling it out" apart from "never started."
    const [{ data: existingCommitments }, { data: intakeForms }] = await Promise.all([
      adminClient
        .from("house_commitments")
        .select("user_id, status")
        .in("user_id", activeIntakeIds.length > 0 ? activeIntakeIds : ["none"]),
      adminClient
        .from("intake_forms")
        .select("user_id, form_data, completed_at, status, updated_at")
        .in("user_id", activeIntakeIds.length > 0 ? activeIntakeIds : ["none"]),
    ]);

    const commitmentByUser = new Map(
      (existingCommitments ?? []).map((c) => [c.user_id, c.status])
    );
    const intakeFormByUser = new Map(
      (intakeForms ?? []).map((f) => [f.user_id, f])
    );

    for (const u of activeIntakeUsers) {
      const commitment = commitmentByUser.get(u.id);
      const form = intakeFormByUser.get(u.id);

      if (commitment === "pending_resident_signature") {
        intakeAwaiting.push({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
        });
        continue;
      }
      if (commitment) {
        // Commitment exists in some other state (e.g. already signed
        // but flags not yet flipped, or cancelled) — skip.
        continue;
      }
      if (u.intake_completed && form?.status === "completed") {
        intakePending.push({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          phone: u.phone ?? null,
          created_at: u.created_at,
          intakeFormData: (form.form_data ?? {}) as Record<string, unknown>,
          completedAt: form.completed_at ?? null,
        });
        continue;
      }
      if (form && form.status !== "completed") {
        intakeInProgress.push({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          lastUpdatedAt:
            (form as { updated_at?: string | null }).updated_at ?? null,
        });
        continue;
      }
      // No form row yet — they were invited but haven't logged in or
      // haven't opened the intake form.
      intakeInvited.push({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        createdAt: u.created_at,
      });
    }

    intakeDenied = deniedUsers.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      denialReason: u.denial_reason,
      deniedAt: u.denied_at,
    }));
  }

  // Check-in batches already fetched in the top-level Promise.all
  type CheckInBatch = {
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
      houseId: string;
    }>;
  };
  const checkInBatches: CheckInBatch[] =
    (checkInBatchesResult as { batches?: CheckInBatch[] } | null)?.batches ?? [];

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
        intakeInvited={intakeInvited}
        intakeInProgress={intakeInProgress}
        intakePending={intakePending}
        intakeAwaiting={intakeAwaiting}
        intakeDenied={intakeDenied}
        checkInBatches={checkInBatches}
      />
    </div>
  );
}
