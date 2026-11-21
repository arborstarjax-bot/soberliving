"use server";
import { err, ok, okVoid } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth";
import { getAppOrigin } from "@/lib/app-url";
import { isValidTimezone } from "@/lib/timezone";
import type { PaymentFrequencyOption, PaymentMethod } from "@/lib/types";

// --- Workspace General ---

export async function updateWorkspaceName(workspaceId: string, name: string) {
  const user = await requireRole("admin");
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    return err("Not authorized");
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("workspaces")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);

  if (error) return err(error.message);
  revalidatePath("/admin/workspace");
  return okVoid();
}

// --- Onboarding Settings ---

export async function updateWorkspaceSettings(
  workspaceId: string,
  settings: {
    // Every field is optional: each settings section saves only its own
    // columns, so a section can be saved on databases that lack newer
    // columns used by other sections.
    require_application?: boolean;
    require_commitment?: boolean;
    enable_payments?: boolean;
    auto_cycle_chores?: boolean;
    auto_cycle_frequency?: "daily" | "weekly" | "biweekly" | "monthly";
    auto_demerit_missed_chores?: boolean;
    auto_demerit_missed_meetings?: boolean;
    auto_demerit_missed_curfew?: boolean;
    require_chore_photo?: boolean;
    require_meeting_photo?: boolean;
    enabled_modules?: string[];
    pass_approver?: "manager" | "admin" | "both";
    resident_modules?: string[];
    intake_mode?: "auto" | "requires_signoff";
    intake_steps?: { id: string; label: string; required?: boolean }[];
    rules_text?: string | null;
    rules_document_id?: string | null;
    require_rule_checkoff?: boolean;
    director_name?: string | null;
    timezone?: string;
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
    return err("Not authorized");
  }
  if (settings.timezone !== undefined && !isValidTimezone(settings.timezone)) {
    return err("Unknown timezone");
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("workspace_settings")
    .update({
      ...(settings.require_application !== undefined
        ? { require_application: settings.require_application }
        : {}),
      ...(settings.require_commitment !== undefined
        ? { require_commitment: settings.require_commitment }
        : {}),
      ...(settings.enable_payments !== undefined
        ? { enable_payments: settings.enable_payments }
        : {}),
      ...(settings.auto_cycle_chores !== undefined
        ? { auto_cycle_chores: settings.auto_cycle_chores }
        : {}),
      ...(settings.auto_cycle_frequency !== undefined
        ? { auto_cycle_frequency: settings.auto_cycle_frequency }
        : {}),
      ...(settings.auto_demerit_missed_chores !== undefined
        ? { auto_demerit_missed_chores: settings.auto_demerit_missed_chores }
        : {}),
      ...(settings.auto_demerit_missed_meetings !== undefined
        ? {
            auto_demerit_missed_meetings:
              settings.auto_demerit_missed_meetings,
          }
        : {}),
      ...(settings.auto_demerit_missed_curfew !== undefined
        ? { auto_demerit_missed_curfew: settings.auto_demerit_missed_curfew }
        : {}),
      ...(settings.require_chore_photo !== undefined
        ? { require_chore_photo: settings.require_chore_photo }
        : {}),
      ...(settings.require_meeting_photo !== undefined
        ? { require_meeting_photo: settings.require_meeting_photo }
        : {}),
      ...(settings.enabled_modules !== undefined
        ? { enabled_modules: settings.enabled_modules }
        : {}),
      ...(settings.pass_approver !== undefined
        ? { pass_approver: settings.pass_approver }
        : {}),
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
      ...(settings.director_name !== undefined
        ? { director_name: settings.director_name }
        : {}),
      ...(settings.timezone !== undefined
        ? { timezone: settings.timezone }
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

  if (error) return err(error.message);
  revalidatePath("/admin/workspace");
  return okVoid();
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
    return err("Not authorized");
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("workspace_payment_config")
    .update({
      ...config,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId);

  if (error) return err(error.message);
  revalidatePath("/admin/workspace");
  return okVoid();
}

// --- House Curfews ---

export async function updateHouseCurfews(
  houseId: string,
  curfews: { day_of_week: string; curfew_time: string; curfew_start_time?: string | null }[]
) {
  const user = await requireRole("admin");
  if (!user.workspace_id) return err("Not authorized");

  const admin = createAdminClient();

  // Verify house belongs to this workspace
  const { data: house } = await admin
    .from("houses")
    .select("workspace_id")
    .eq("id", houseId)
    .maybeSingle();

  if (!house || house.workspace_id !== user.workspace_id) {
    return err("House not found in your workspace");
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
    if (error) return err(error.message);
  }

  const allDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const removedDays = allDays.filter((d) => !submittedDays.includes(d));
  if (removedDays.length > 0) {
    const { error: deleteError } = await admin
      .from("house_curfews")
      .delete()
      .eq("house_id", houseId)
      .in("day_of_week", removedDays);
    if (deleteError) return err(deleteError.message);
  }

  revalidatePath("/admin/workspace");
  return okVoid();
}

// --- Workspace Invite Link ---

export async function getWorkspaceInviteLink() {
  const user = await requireRole("admin");
  if (!user.workspace_id) return err("Not authorized");

  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("invite_code")
    .eq("id", user.workspace_id)
    .single();

  if (!ws) return err("Workspace not found");

  const appUrl = await getAppOrigin();
  return ok({ inviteUrl: `${appUrl}/register?workspace=${ws.invite_code}` });
}


// --- Approve / Deny Pending Members ---

export async function approvePendingMember(memberId: string) {
  const user = await requireRole("admin");
  if (!user.workspace_id) return err("Not authorized");

  const admin = createAdminClient();

  const { data: member } = await admin
    .from("workspace_members")
    .select("id, status, workspace_id")
    .eq("id", memberId)
    .eq("workspace_id", user.workspace_id)
    .maybeSingle();

  if (!member) return err("Member not found");
  if (member.status !== "pending") return err("Member is not pending approval");

  const { error } = await admin
    .from("workspace_members")
    .update({ status: "active" })
    .eq("id", memberId);

  if (error) return err(error.message);
  revalidatePath("/admin/workspace");
  return okVoid();
}

export async function denyPendingMember(memberId: string) {
  const user = await requireRole("admin");
  if (!user.workspace_id) return err("Not authorized");

  const admin = createAdminClient();

  const { data: member } = await admin
    .from("workspace_members")
    .select("id, status, workspace_id")
    .eq("id", memberId)
    .eq("workspace_id", user.workspace_id)
    .maybeSingle();

  if (!member) return err("Member not found");
  if (member.status !== "pending") return err("Member is not pending approval");

  const { error } = await admin
    .from("workspace_members")
    .update({ status: "denied" })
    .eq("id", memberId);

  if (error) return err(error.message);
  revalidatePath("/admin/workspace");
  return okVoid();
}

// --- Remove Members ---

export async function removeWorkspaceMember(memberId: string) {
  const user = await requireRole("admin");
  if (!user.workspace_id) return err("Not authorized");

  const admin = createAdminClient();

  const { data: member } = await admin
    .from("workspace_members")
    .select("role, user_id")
    .eq("id", memberId)
    .eq("workspace_id", user.workspace_id)
    .maybeSingle();

  if (!member) return err("Member not found");
  if (member.role === "owner") return err("Cannot remove the workspace owner");
  if (member.user_id === user.id) return err("Cannot remove yourself");

  const { error } = await admin
    .from("workspace_members")
    .delete()
    .eq("id", memberId);

  if (error) return err(error.message);
  revalidatePath("/admin/workspace");
  return okVoid();
}

// --- Workspace Deletion (App Store guideline 5.1.1) ---
// Admin-only, requires typing the workspace name. Purges storage files
// best-effort, deletes auth users, then the delete_workspace_cascade
// function sweeps every workspace-scoped row.
export async function deleteWorkspace(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireRole("admin");
  const workspaceId = user.workspace_id;
  if (!workspaceId) return err("Not authorized");

  const confirmText = (formData.get("confirm") as string | null)?.trim();
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, name")
    .eq("id", workspaceId)
    .single();
  if (!ws) return err("Workspace not found");
  if (confirmText !== ws.name) {
    return err(`Type "${ws.name}" to confirm deletion`);
  }

  // Collect auth user ids before the cascade removes the member rows.
  const { data: members } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);
  const userIds = (members ?? []).map((m) => m.user_id as string);

  // Collect storage objects to purge. Paths live on these document/
  // attachment tables — query the ones that carry a file_path or
  // storage_path and are workspace or house scoped.
  const { data: houses } = await admin
    .from("houses")
    .select("id")
    .eq("workspace_id", workspaceId);
  const houseIds = (houses ?? []).map((h) => h.id as string);

  const purgeBucket = async (
    bucket: string,
    table: string,
    pathCol: string,
    scopeCol: string,
    scopeIds: string[]
  ) => {
    if (scopeIds.length === 0) return;
    const { data: rows } = await admin
      .from(table)
      .select(pathCol)
      .in(scopeCol, scopeIds);
    const paths = (rows ?? [])
      .map((r) => r[pathCol as keyof typeof r] as string | null)
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      await admin.storage.from(bucket).remove(paths);
    }
  };

  await purgeBucket("house-documents", "house_documents", "file_path", "house_id", houseIds);
  await purgeBucket("admin-vault", "documents", "file_path", "workspace_id", [workspaceId]);

  const { error: cascadeError } = await admin.rpc("delete_workspace_cascade", {
    p_workspace_id: workspaceId,
  });
  if (cascadeError) return err(cascadeError.message);

  // Auth users last — deleting them earlier would orphan nothing, but
  // doing it after the cascade keeps member-row cleanup deterministic.
  for (const uid of userIds) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }

  redirect("/login");
}
