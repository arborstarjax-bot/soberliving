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

  // Phase 1: users profile and role lookup are both keyed on user.id
  // only — fire in parallel instead of sequentially. On a 50–100ms
  // Supabase RTT this saves a full round-trip on every server
  // component render that calls requireAuth() (i.e. every dashboard
  // page load). `cache()` guarantees one execution per request.
  const adminForWorkspace = createAdminClient();
  const [profileRes, roleRes, workspaceMemberRes] = await Promise.all([
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
    adminForWorkspace
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  if (!profile) return null;

  // Gate pending / rejected accounts at the session layer. Defense in
  // depth: the login action already blocks these, but this also catches
  // users whose status was changed while they were holding a stale
  // session cookie.
  const status = (profile as { account_status?: string | null })
    .account_status;
  if (status && status !== "active") return null;

  const role: UserRole = roleRes.data?.role ?? "resident";

  // Read intake/commitment status from the users table
  // (submitIntakeForm and signCommitment both write to users, not residents)
  const isResident = role === "resident" || profile.is_resident === true;

  // Phase 2: manager-assignment + resident-only gating queries all
  // depend only on (profile.id, role) and are independent of each
  // other — fan them out in parallel. For admins nothing fires at
  // all; for managers only the assignment lookup runs; for residents
  // the full trio runs concurrently.
  const admin = isResident ? createAdminClient() : null;

  const assignmentsPromise =
    role === "manager"
      ? supabase
          .from("manager_house_assignments")
          .select("house_id")
          .eq("user_id", user.id)
          .is("unassigned_at", null)
      : Promise.resolve({ data: null as { house_id: string }[] | null });

  // house_commitments has no resident-scoped SELECT policy, so every
  // reader uses the admin client (matches sign-commitment page,
  // proposeAmendment, intake-review, residents profile, etc.).
  const pendingCommitmentPromise =
    isResident && admin
      ? admin
          .from("house_commitments")
          .select("id")
          .eq("user_id", profile.id)
          .eq("status", "pending_resident_signature")
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as { id: string } | null });

  // Gate residents into /acknowledge/[id] if any active blocker is
  // targeted at them and not yet signed. Admins/managers can't be
  // the target of a blocker. Resolution is FIFO — oldest pending id
  // first so multi-blocker scenarios step through one at a time.
  //
  // After findPendingBlockerForUser returns a candidate, re-verify
  // the row still exists, is not archived, and has no ack from this
  // user. If the candidate is stale (e.g. orphaned rows from a
  // manually-recreated auth.users account, a race with
  // maybeAutoArchiveBlocker, or a cross-request state drift) we
  // null it out instead of exposing it on the session — otherwise
  // every layout that reads pending_blocker_id would blindly redirect
  // the resident into /acknowledge/[id], which would bounce them
  // right back (blocker missing/acked → redirect /dashboard) and
  // the browser hits its 20-redirect cap on a blank page.
  //
  // Centralizing this guarantee here means every consumer —
  // (dashboard)/layout, (check-in)/layout, future gates — can
  // trust pending_blocker_id without having to re-verify.
  const pendingBlockerPromise =
    isResident && admin
      ? findPendingBlockerForUser(profile.id, admin).then(async (id) => {
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
              .eq("user_id", profile.id)
              .maybeSingle(),
          ]);
          const stillPending =
            !!blockerRes.data &&
            !blockerRes.data.archived_at &&
            !ackRes.data;
          return stillPending ? id : null;
        })
      : Promise.resolve(null);

  // Detect "discharged" residents: any residents row exists for
  // this user but none are currently active. Used by the layout
  // to hard-gate them onto /discharged. Role admin/manager users
  // who were also residents don't need this gate — their elevated
  // role takes over.
  const residentStatusPromise =
    role === "resident" && admin
      ? admin
          .from("residents")
          .select("status")
          .eq("user_id", profile.id)
      : Promise.resolve({ data: null as { status: string }[] | null });

  const [
    assignmentsRes,
    pendingCommitmentRes,
    pendingBlockerId,
    residentStatusRes,
  ] = await Promise.all([
    assignmentsPromise,
    pendingCommitmentPromise,
    pendingBlockerPromise,
    residentStatusPromise,
  ]);

  const assignedHouseIds: string[] =
    assignmentsRes.data?.map((a) => a.house_id) ?? [];
  const hasPendingCommitment = !!pendingCommitmentRes.data;

  const intakeCompleted = profile.intake_completed === true;
  const commitmentSigned = profile.commitment_signed === true;

  // A resident is "discharged" when at least one residents row
  // exists for them and none are currently active. Pre-intake
  // residents (no rows yet) fall through to the normal intake flow.
  const residentRows = residentStatusRes.data ?? [];
  const residentDischarged =
    role === "resident" &&
    residentRows.length > 0 &&
    residentRows.every((r) => r.status !== "active");

  const workspaceId: string | null =
    (profile as { workspace_id?: string | null }).workspace_id ??
    workspaceMemberRes.data?.workspace_id ??
    null;
  const workspaceRole: WorkspaceRole | null =
    (workspaceMemberRes.data?.role as WorkspaceRole) ?? null;

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role,
    workspace_id: workspaceId,
    workspace_role: workspaceRole,
    assigned_house_ids: assignedHouseIds,
    intake_completed: intakeCompleted,
    is_resident: isResident,
    commitment_signed: commitmentSigned,
    has_pending_commitment: hasPendingCommitment,
    pending_blocker_id: pendingBlockerId,
    resident_discharged: residentDischarged,
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
