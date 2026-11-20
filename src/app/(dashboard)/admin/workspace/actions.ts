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
    auto_cycle_chores: boolean;
    auto_cycle_frequency?: "daily" | "weekly" | "biweekly" | "monthly";
    auto_demerit_missed_chores: boolean;
    auto_demerit_missed_meetings: boolean;
    auto_demerit_missed_curfew: boolean;
    require_chore_photo: boolean;
    require_meeting_photo: boolean;
    enabled_modules: string[];
    pass_approver: "manager" | "admin" | "both";
    resident_modules?: string[];
    intake_mode?: "auto" | "requires_signoff";
    intake_steps?: { id: string; label: string; required?: boolean }[];
    rules_text?: string | null;
    rules_document_id?: string | null;
    require_rule_checkoff?: boolean;
    check_in_schedules?: {
      id: string;
      label?: string;
      house_ids?: string[];
      frequency?: "daily" | "weekly" | "biweekly" | "monthly";
      day_of_week?: number;
      day_of_month?: number;
      enabled?: boolean;
      last_sent_on?: string;
    }[];
    reminder_settings?: Record<
      string,
      { enabled?: boolean; timing?: "day_of" | "day_before" }
    >;
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
      auto_cycle_chores: settings.auto_cycle_chores,
      ...(settings.auto_cycle_frequency !== undefined
        ? { auto_cycle_frequency: settings.auto_cycle_frequency }
        : {}),
      auto_demerit_missed_chores: settings.auto_demerit_missed_chores,
      auto_demerit_missed_meetings: settings.auto_demerit_missed_meetings,
      auto_demerit_missed_curfew: settings.auto_demerit_missed_curfew,
      require_chore_photo: settings.require_chore_photo,
      require_meeting_photo: settings.require_meeting_photo,
      enabled_modules: settings.enabled_modules,
      pass_approver: settings.pass_approver,
      ...(settings.resident_modules !== undefined
        ? { resident_modules: settings.resident_modules }
        : {}),
      ...(settings.intake_mode !== undefined
        ? { intake_mode: settings.intake_mode }
        : {}),
      ...(settings.intake_steps !== undefined
        ? { intake_steps: settings.intake_steps }
        : {}),
      ...(settings.rules_text !== undefined
        ? { rules_text: settings.rules_text }
        : {}),
      ...(settings.rules_document_id !== undefined
        ? { rules_document_id: settings.rules_document_id }
        : {}),
      ...(settings.require_rule_checkoff !== undefined
        ? { require_rule_checkoff: settings.require_rule_checkoff }
        : {}),
      ...(settings.check_in_schedules !== undefined
        ? { check_in_schedules: settings.check_in_schedules }
        : {}),
      ...(settings.reminder_settings !== undefined
        ? { reminder_settings: settings.reminder_settings }
        : {}),
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
  curfews: { day_of_week: string; curfew_time: string; curfew_start_time?: string | null }[]
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
      curfew_start_time: c.curfew_start_time ?? null,
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
