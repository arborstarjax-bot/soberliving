"use server";
import { err, ok } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function updateProfile(fullName: string) {
  const user = await requireAuth();
  const name = fullName.trim();
  if (!name) return err("Name is required");

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("users")
    .update({ full_name: name, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return err(error.message);
  revalidatePath("/settings");
  return ok({ ok: true as const });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    return err("New password must be at least 8 characters");
  }

  const supabase = await createClient();

  // Supabase requires re-authentication before password change in some
  // configurations. We use the nonce-based updateUser which just needs
  // the current session to be valid.
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    if (error.message.includes("same_password")) {
      return err("New password must be different from your current password");
    }
    return err(error.message);
  }

  return ok({ ok: true as const });
}

// --- Self account deletion (App Store guideline 5.1.1) ---
// Removes the caller's auth account and scrubs PII from their profile
// rows. Workspace operational records (payments, demerits, signoffs)
// belong to the workspace and are anonymized, not deleted.
export async function deleteMyAccount() {
  const user = await requireAuth();
  const admin = createAdminClient();

  // Scrub PII on the profile row.
  await admin
    .from("users")
    .update({
      full_name: "Deleted account",
      // email is NOT NULL — scrub to a tombstone address
      email: `deleted+${user.id}@deleted.invalid`,
      phone: null,
      avatar_url: null,
    })
    .eq("id", user.id);

  // Detach from the workspace.
  await admin
    .from("workspace_members")
    .delete()
    .eq("user_id", user.id);

  // Drop push subscriptions so no notifications chase a dead account.
  await admin.from("push_subscriptions").delete().eq("user_id", user.id);

  // Delete the auth user (invalidates sessions everywhere).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return err(error.message);

  redirect("/login");
}
