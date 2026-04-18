import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { SessionUser, UserRole } from "@/lib/types";

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select(
      "id, email, full_name, intake_completed, commitment_signed, is_resident, account_status"
    )
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  // Gate pending / rejected accounts at the session layer. Defense in
  // depth: the login action already blocks these, but this also catches
  // users whose status was changed while they were holding a stale
  // session cookie.
  const status = (profile as { account_status?: string | null })
    .account_status;
  if (status && status !== "active") return null;

  const { data: roleRecord } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const role: UserRole = roleRecord?.role ?? "resident";

  let assignedHouseIds: string[] = [];
  if (role === "manager") {
    const { data: assignments } = await supabase
      .from("manager_house_assignments")
      .select("house_id")
      .eq("user_id", user.id)
      .is("unassigned_at", null);
    assignedHouseIds = assignments?.map((a) => a.house_id) ?? [];
  }

  // Read intake/commitment status from the users table
  // (submitIntakeForm and signCommitment both write to users, not residents)
  const isResident = role === "resident" || profile.is_resident === true;
  const intakeCompleted = profile.intake_completed === true;
  const commitmentSigned = profile.commitment_signed === true;

  // Pending commitment = any house_commitments row awaiting this
  // user's signature. Covers the initial commitment (before they've
  // ever signed) and amendments proposed after they signed. Layouts
  // use this to force residents into /sign-commitment even when
  // commitment_signed is already true.
  //
  // Uses the admin (service-role) client deliberately. Every other
  // reader of house_commitments in the app does the same
  // (sign-commitment page, proposeAmendment, intake-review, residents
  // profile, etc.) because the table has no resident-scoped SELECT
  // RLS policy. If we used the RLS-bound client here the query would
  // silently return null for residents and the redirect would be a
  // no-op — the original intent of the PR #47 fix.
  let hasPendingCommitment = false;
  if (isResident) {
    const admin = createAdminClient();
    const { data: pending } = await admin
      .from("house_commitments")
      .select("id")
      .eq("user_id", profile.id)
      .eq("status", "pending_resident_signature")
      .limit(1)
      .maybeSingle();
    hasPendingCommitment = !!pending;
  }

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role,
    assigned_house_ids: assignedHouseIds,
    intake_completed: intakeCompleted,
    is_resident: isResident,
    commitment_signed: commitmentSigned,
    has_pending_commitment: hasPendingCommitment,
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
