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

  const { error: statusErr } = await admin
    .from("users")
    .update({ account_status: "active" })
    .eq("id", userId);
  if (statusErr) return { error: statusErr.message };

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
  const { error } = await admin
    .from("users")
    .update({ account_status: "rejected" })
    .eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/pending-users");
  revalidatePath("/admin");
  return {};
}
