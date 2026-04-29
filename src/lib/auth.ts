import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { findPendingBlockerForUser } from "@/lib/blockers";
import type { SessionUser, UserRole, WorkspaceRole } from "@/lib/types";

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // --- Single fan-out: fire ALL queries in parallel ---
  // Previously split into Phase 1 (profile + role + workspace member)
  // then Phase 2 (assignments, commitments, blockers, etc.) — two
  // sequential round-trips (~200ms). Now every query that only needs
  // user.id fires at once. Queries whose results are role-dependent
  // are evaluated after the fan-out; the extra data is harmlessly
  // discarded for roles that don't need it.
  const admin = createAdminClient();

  const [
    profileRes,
    roleRes,
    workspaceMemberRes,
    assignmentsRes,
    pendingCommitmentRes,
    pendingBlockerId,
    residentStatusRes,
  ] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, email, full_name, intake_completed, commitment_signed, is_resident, account_status, workspace_id"
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .limit(1)
      .single(),
    admin
      .from("workspace_members")
      .select("workspace_id, role, status")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
    // Manager assignments — harmlessly empty for non-managers
    supabase
      .from("manager_house_assignments")
      .select("house_id")
      .eq("user_id", user.id)
      .is("unassigned_at", null),
    // Pending commitment — harmlessly empty for non-residents
    admin
      .from("house_commitments")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending_resident_signature")
      .limit(1)
      .maybeSingle(),
    // Pending blocker — harmlessly null for non-residents
    findPendingBlockerForUser(user.id, admin).then(async (id) => {
      if (!id) return null;
      const [blockerRes, ackRes] = await Promise.all([
        admin
          .from("blockers")
          .select("id, archived_at")
          .eq("id", id)
          .maybeSingle(),
        admin
          .from("blocker_acknowledgments")
          .select("blocker_id")
          .eq("blocker_id", id)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      const stillPending =
        !!blockerRes.data &&
        !blockerRes.data.archived_at &&
        !ackRes.data;
      return stillPending ? id : null;
    }),
    // Resident discharge status — harmlessly empty for non-residents
    admin
      .from("residents")
      .select("status")
      .eq("user_id", user.id),
  ]);

  const profile = profileRes.data;
  if (!profile) return null;

  const status = (profile as { account_status?: string | null })
    .account_status;
  if (status && status !== "active") return null;

  const role: UserRole = roleRes.data?.role ?? "resident";
  const isResident = role === "resident" || profile.is_resident === true;

  // Resolve workspace_id from profile or workspace_members lookup
  const profileWsId = (profile as { workspace_id?: string | null }).workspace_id
    ?? workspaceMemberRes.data?.workspace_id
    ?? null;

  // Admin workspace house scoping — only needed for admins, fires as a
  // single follow-up query. Admins are a minority of users so the extra
  // round-trip only affects them, not the resident hot path.
  let workspaceHouseIds: string[] = [];
  if (role === "admin" && profileWsId) {
    const { data } = await admin
      .from("houses")
      .select("id")
      .eq("workspace_id", profileWsId);
    workspaceHouseIds = data?.map((h) => h.id) ?? [];
  }

  const assignedHouseIds: string[] =
    role === "manager"
      ? (assignmentsRes.data?.map((a) => a.house_id) ?? [])
      : [];
  const hasPendingCommitment = isResident ? !!pendingCommitmentRes.data : false;

  const intakeCompleted = profile.intake_completed === true;
  const commitmentSigned = profile.commitment_signed === true;

  const residentRows = residentStatusRes.data ?? [];
  const residentDischarged =
    role === "resident" &&
    residentRows.length > 0 &&
    residentRows.every((r) => r.status !== "active");

  const workspaceId: string | null = profileWsId;
  const memberStatus = (workspaceMemberRes.data?.status as string) ?? null;
  const workspaceRole: WorkspaceRole | null =
    memberStatus === "active"
      ? (workspaceMemberRes.data?.role as WorkspaceRole) ?? null
      : null;

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role,
    workspace_id: workspaceId,
    workspace_role: workspaceRole,
    assigned_house_ids: assignedHouseIds,
    workspace_house_ids: workspaceHouseIds,
    intake_completed: intakeCompleted,
    is_resident: isResident,
    commitment_signed: commitmentSigned,
    has_pending_commitment: hasPendingCommitment,
    pending_blocker_id: isResident ? pendingBlockerId : null,
    resident_discharged: residentDischarged,
    workspace_member_status: memberStatus as SessionUser["workspace_member_status"],
  };
});

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireRole(
  ...roles: UserRole[]
): Promise<SessionUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}
