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
  settings: {
    require_application: boolean;
    require_commitment: boolean;
    enable_payments: boolean;
  }
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
      enable_payments: settings.enable_payments,
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
    default_weekly_rent_amount: number;
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

  const submittedDays = curfews.map((c) => c.day_of_week);

  if (curfews.length > 0) {
    const rows = curfews.map((c) => ({
      house_id: houseId,
      day_of_week: c.day_of_week,
      curfew_time: c.curfew_time,
    }));
    const { error } = await admin
      .from("house_curfews")
      .upsert(rows, { onConflict: "house_id,day_of_week" });
    if (error) return { error: error.message };
  }

  const allDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const removedDays = allDays.filter((d) => !submittedDays.includes(d));
  if (removedDays.length > 0) {
    const { error: deleteError } = await admin
      .from("house_curfews")
      .delete()
      .eq("house_id", houseId)
      .in("day_of_week", removedDays);
    if (deleteError) return { error: deleteError.message };
  }

  revalidatePath("/admin/workspace");
  return {};
}

// --- Workspace Invite Link ---

export async function getWorkspaceInviteLink() {
  const user = await requireRole("admin");
  if (!user.workspace_id) return { error: "Not authorized", inviteUrl: "" };

  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("invite_code")
    .eq("id", user.workspace_id)
    .single();

  if (!ws) return { error: "Workspace not found", inviteUrl: "" };

  const appUrl = await getAppOrigin();
  return { inviteUrl: `${appUrl}/register?workspace=${ws.invite_code}` };
}


// --- Approve / Deny Pending Members ---

export async function approvePendingMember(memberId: string) {
  const user = await requireRole("admin");
  if (!user.workspace_id) return { error: "Not authorized" };

  const admin = createAdminClient();

  const { data: member } = await admin
    .from("workspace_members")
    .select("id, status, workspace_id")
    .eq("id", memberId)
    .eq("workspace_id", user.workspace_id)
    .maybeSingle();

  if (!member) return { error: "Member not found" };
  if (member.status !== "pending") return { error: "Member is not pending approval" };

  const { error } = await admin
    .from("workspace_members")
    .update({ status: "active" })
    .eq("id", memberId);

  if (error) return { error: error.message };
  revalidatePath("/admin/workspace");
  return {};
}

export async function denyPendingMember(memberId: string) {
  const user = await requireRole("admin");
  if (!user.workspace_id) return { error: "Not authorized" };

  const admin = createAdminClient();

  const { data: member } = await admin
    .from("workspace_members")
    .select("id, status, workspace_id")
    .eq("id", memberId)
    .eq("workspace_id", user.workspace_id)
    .maybeSingle();

  if (!member) return { error: "Member not found" };
  if (member.status !== "pending") return { error: "Member is not pending approval" };

  const { error } = await admin
    .from("workspace_members")
    .update({ status: "denied" })
    .eq("id", memberId);

  if (error) return { error: error.message };
  revalidatePath("/admin/workspace");
  return {};
}

// --- Remove Members ---

export async function removeWorkspaceMember(memberId: string) {
  const user = await requireRole("admin");
  if (!user.workspace_id) return { error: "Not authorized" };

  const admin = createAdminClient();

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
