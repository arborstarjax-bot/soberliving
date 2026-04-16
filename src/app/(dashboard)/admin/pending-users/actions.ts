"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export async function approvePendingUser(
  userId: string,
  role: UserRole
): Promise<{ error?: string }> {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Not authorized" };

  if (!["admin", "manager", "resident"].includes(role)) {
    return { error: "Invalid role" };
  }

  const admin = createAdminClient();

  // Defend against stale UI / concurrent approvals. If the target isn't
  // pending anymore (another admin already approved or rejected), do
  // nothing and return an explicit error instead of silently flipping
  // the account's role/status out from under it.
  const { data: target, error: targetErr } = await admin
    .from("users")
    .select("account_status")
    .eq("id", userId)
    .maybeSingle();
  if (targetErr) return { error: targetErr.message };
  if (!target) return { error: "User not found" };
  if (target.account_status !== "pending") {
    return { error: "User is no longer pending" };
  }

  // Role MUST be written before status is flipped to 'active'. These are
  // two separate writes (no transaction available via PostgREST), so if
  // the role upsert fails after we've already promoted the account, the
  // user can sign in and would silently fall back to the 'resident'
  // default in getSessionUser. Doing the role first means the worst-case
  // partial failure leaves the account 'pending' — safe.
  const { error: roleErr } = await admin
    .from("user_roles")
    .upsert(
      { user_id: userId, role },
      { onConflict: "user_id" }
    );
  if (roleErr) return { error: roleErr.message };

  // The status flip is guarded by account_status='pending' so a race
  // with another admin's approval / rejection becomes a no-op instead
  // of overwriting an already-active account's status.
  const { data: updated, error: statusErr } = await admin
    .from("users")
    .update({ account_status: "active" })
    .eq("id", userId)
    .eq("account_status", "pending")
    .select("id");
  if (statusErr) return { error: statusErr.message };
  if (!updated || updated.length === 0) {
    return { error: "User is no longer pending" };
  }

  revalidatePath("/admin/pending-users");
  revalidatePath("/admin");
  return {};
}

export async function rejectPendingUser(
  userId: string
): Promise<{ error?: string }> {
  const user = await requireAuth();
  if (user.role !== "admin") return { error: "Not authorized" };

  const admin = createAdminClient();
  // Guarded on account_status='pending' so a bug or stale UI can never
  // accidentally lock out an already-active user by calling reject on
  // their id.
  const { data: updated, error } = await admin
    .from("users")
    .update({ account_status: "rejected" })
    .eq("id", userId)
    .eq("account_status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) {
    return { error: "User is no longer pending" };
  }

  revalidatePath("/admin/pending-users");
  revalidatePath("/admin");
  return {};
}
