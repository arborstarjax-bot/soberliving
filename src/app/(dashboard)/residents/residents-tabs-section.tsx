import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/types";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { getDaysSober } from "@/lib/milestones";
import { getHouseToday } from "@/lib/timezone";
import { getCheckInBatches } from "../check-ins/actions";
import { ResidentsTabs } from "./residents-tabs";
import { getWorkspaceSettings } from "@/lib/workspace";

/**
 * Heavy data gather for the Residents page. Rendered inside a
 * `<Suspense>` boundary by `page.tsx` so the header + Create User
 * button paint immediately while this streams in.
 *
 * Cursor pagination for the Active Residents tab is intentionally
 * deferred: the existing `ResidentsTabs` client component renders
 * four cross-cutting tabs (Current / Staff / Intake funnel /
 * Check-ins) from a single prop payload, so URL-driven pagination
 * would need to be wired through each tab. Shipping the streaming
 * shell first (the big perceived-speed win) and leaving the in-tab
 * pagination for a focused follow-up PR on this page specifically.
 */
export async function ResidentsTabsSection({
  user,
}: {
  user: SessionUser;
}) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const isAdmin = user.role === "admin";
  const isStaff = user.role === "admin" || user.role === "manager";

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
  const intakeUsersQuery =
    isStaff && adminClient
      ? adminClient
          .from("users")
          .select(
            "id, full_name, email, phone, intake_completed, commitment_signed, is_active, account_status, denial_reason, denied_at, created_at, user_roles(role)"
          )
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

  const normalizedStaff = rawStaffUsers
    .filter((u) => {
      const roles = u.user_roles;
      const role = Array.isArray(roles) ? roles[0]?.role : roles?.role;
      return role === "admin" || role === "manager";
    })
    .map((u) => {
      const roles = u.user_roles;
      const role =
        (Array.isArray(roles) ? roles[0]?.role : roles?.role) ?? "resident";
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

  const intakeInvited: Array<{
    id: string;
    full_name: string;
    email: string;
    createdAt: string;
  }> = [];
  const intakeInProgress: Array<{
    id: string;
    full_name: string;
    email: string;
    lastUpdatedAt: string | null;
  }> = [];
  const intakePending: Array<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    created_at: string;
    intakeFormData: Record<string, unknown>;
    intakeSignatures: Record<string, string>;
    staffSignedOffAt: string | null;
    completedAt: string | null;
  }> = [];
  const intakeAwaiting: Array<{
    id: string;
    full_name: string;
    email: string;
    commitment: {
      paymentFrequency: "weekly" | "monthly";
      rentAmount: number;
      adminFee: number;
      commitmentStartDate: string;
      commitmentTerm: string;
      notes: string | null;
      isAmendment: boolean;
    } | null;
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
    const intakeUsers = rawIntakeUsers.filter((u) => {
      const roles = u.user_roles;
      const role = Array.isArray(roles) ? roles[0]?.role : roles?.role;
      return role === "resident" || role == null;
    });

    const deniedUsers = intakeUsers.filter(
      (u) => u.account_status === "rejected"
    );
    const activeIntakeUsers = intakeUsers.filter(
      (u) => u.account_status !== "rejected"
    );
    const activeIntakeIds = activeIntakeUsers.map((u) => u.id);

    const [{ data: existingCommitments }, { data: intakeForms }] =
      await Promise.all([
        adminClient
          .from("house_commitments")
          .select(
            "user_id, status, payment_frequency, rent_amount, admin_fee, commitment_start_date, commitment_term, notes, parent_commitment_id"
          )
          .in(
            "user_id",
            activeIntakeIds.length > 0 ? activeIntakeIds : ["none"]
          ),
        adminClient
          .from("intake_forms")
          .select("user_id, form_data, signatures, completed_at, status, updated_at")
          .in(
            "user_id",
            activeIntakeIds.length > 0 ? activeIntakeIds : ["none"]
          ),
      ]);

    const commitmentByUser = new Map(
      (existingCommitments ?? []).map((c) => [c.user_id, c])
    );
    const intakeFormByUser = new Map(
      (intakeForms ?? []).map((f) => [f.user_id, f])
    );

    for (const u of activeIntakeUsers) {
      const commitment = commitmentByUser.get(u.id);
      const form = intakeFormByUser.get(u.id);

      if (commitment?.status === "pending_resident_signature") {
        intakeAwaiting.push({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          commitment: {
            paymentFrequency:
              ((commitment.payment_frequency as
                | "weekly"
                | "monthly"
                | null) ?? "monthly"),
            rentAmount: Number(commitment.rent_amount ?? 0),
            adminFee: Number(commitment.admin_fee ?? 0),
            commitmentStartDate:
              (commitment.commitment_start_date as string | null) ??
              getHouseToday(),
            commitmentTerm:
              (commitment.commitment_term as string | null) ?? "181 days",
            notes: (commitment.notes as string | null) ?? null,
            isAmendment: Boolean(commitment.parent_commitment_id),
          },
        });
        continue;
      }
      if (commitment) {
        continue;
      }
      if (u.intake_completed && form?.status === "completed") {
        const fd = (form.form_data ?? {}) as Record<string, unknown>;
        const staffSignedOffAt =
          typeof fd.staff_signed_off_at === "string"
            ? (fd.staff_signed_off_at as string)
            : null;
        intakePending.push({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          phone: u.phone ?? null,
          created_at: u.created_at,
          intakeFormData: fd,
          intakeSignatures:
            ((form as { signatures?: Record<string, string> | null })
              .signatures ?? {}) as Record<string, string>,
          staffSignedOffAt,
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
    (checkInBatchesResult as { batches?: CheckInBatch[] } | null)?.batches ??
    [];

  const wsSettings = user.workspace_id
    ? await getWorkspaceSettings(user.workspace_id)
    : null;
  const requireCommitment = wsSettings?.require_commitment !== false;

  return (
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
      requireCommitment={requireCommitment}
    />
  );
}
