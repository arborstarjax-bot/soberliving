"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { getAppOrigin } from "@/lib/app-url";
import type { PaymentFrequencyOption, PaymentMethod } from "@/lib/types";

// --- Workspace General ---

export async function updateWorkspaceName(workspaceId: string, name: string) {
  const user = await requireRole("admin");
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    return { error: "Not authorized" };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("workspaces")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/admin/workspace");
  return {};
}

// --- Onboarding Settings ---

export async function updateWorkspaceSettings(
  workspaceId: string,
  settings: { require_application: boolean; require_commitment: boolean }
) {
  const user = await requireRole("admin");
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    return { error: "Not authorized" };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("workspace_settings")
    .update({
      require_application: settings.require_application,
      require_commitment: settings.require_commitment,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/admin/workspace");
  return {};
}

// --- Payment Config ---

export async function updatePaymentConfig(
  workspaceId: string,
  config: {
    default_rent_amount: number;
    payment_frequency: PaymentFrequencyOption;
    payment_due_day: string | null;
    accepted_methods: PaymentMethod[];
    late_fee_amount: number;
    grace_period_days: number;
  }
) {
  const user = await requireRole("admin");
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    return { error: "Not authorized" };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("workspace_payment_config")
    .update({
      ...config,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/admin/workspace");
  return {};
}

// --- House Curfews ---

export async function updateHouseCurfews(
  houseId: string,
  curfews: { day_of_week: string; curfew_time: string }[]
) {
  const user = await requireRole("admin");
  if (!user.workspace_id) return { error: "Not authorized" };

  const admin = createAdminClient();

  // Verify house belongs to this workspace
  const { data: house } = await admin
    .from("houses")
    .select("workspace_id")
    .eq("id", houseId)
    .maybeSingle();

  if (!house || house.workspace_id !== user.workspace_id) {
    return { error: "House not found in your workspace" };
  }

  // Delete existing curfews and replace
  await admin.from("house_curfews").delete().eq("house_id", houseId);

  if (curfews.length > 0) {
    const rows = curfews.map((c) => ({
      house_id: houseId,
      day_of_week: c.day_of_week,
      curfew_time: c.curfew_time,
    }));
    const { error } = await admin.from("house_curfews").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/workspace");
  return {};
}

// --- Invite Members ---

export async function sendWorkspaceInvite(
  workspaceId: string,
  email: string,
  role: string
) {
  const user = await requireRole("admin");
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    return { error: "Not authorized" };
  }

  const admin = createAdminClient();

  // Check if already a member
  const { data: existing } = await admin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", (
      await admin.from("users").select("id").eq("email", email).maybeSingle()
    ).data?.id ?? "")
    .maybeSingle();

  if (existing) {
    return { error: "This user is already a member of the workspace" };
  }

  // Check for pending invite
  const { data: pendingInvite } = await admin
    .from("workspace_invites")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (pendingInvite) {
    return { error: "An invite is already pending for this email" };
  }

  const { data: inviteRow, error } = await admin
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email,
      role,
      invited_by: user.id,
    })
    .select("token")
    .single();

  if (error) return { error: error.message };

  const appUrl = await getAppOrigin();
  const inviteUrl = `${appUrl}/register?invite=${inviteRow.token}`;

  revalidatePath("/admin/workspace");
  return { inviteUrl };
}

export async function revokeWorkspaceInvite(inviteId: string) {
  const user = await requireRole("admin");
  if (!user.workspace_id) return { error: "Not authorized" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("workspace_invites")
    .delete()
    .eq("id", inviteId)
    .eq("workspace_id", user.workspace_id);

  if (error) return { error: error.message };
  revalidatePath("/admin/workspace");
  return {};
}

export async function removeWorkspaceMember(memberId: string) {
  const user = await requireRole("admin");
  if (!user.workspace_id) return { error: "Not authorized" };

  const admin = createAdminClient();

  // Don't allow removing the owner
  const { data: member } = await admin
    .from("workspace_members")
    .select("role, user_id")
    .eq("id", memberId)
    .eq("workspace_id", user.workspace_id)
    .maybeSingle();

  if (!member) return { error: "Member not found" };
  if (member.role === "owner") return { error: "Cannot remove the workspace owner" };
  if (member.user_id === user.id) return { error: "Cannot remove yourself" };

  const { error } = await admin
    .from("workspace_members")
    .delete()
    .eq("id", memberId);

  if (error) return { error: error.message };
  revalidatePath("/admin/workspace");
  return {};
}
