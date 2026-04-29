"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

export async function updateProfile(fullName: string) {
  const user = await requireAuth();
  const name = fullName.trim();
  if (!name) return { error: "Name is required" };

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("users")
    .update({ full_name: name, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function changePassword(currentPassword: string, newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    return { error: "New password must be at least 8 characters" };
  }

  const supabase = await createClient();

  // Supabase requires re-authentication before password change in some
  // configurations. We use the nonce-based updateUser which just needs
  // the current session to be valid.
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    if (error.message.includes("same_password")) {
      return { error: "New password must be different from your current password" };
    }
    return { error: error.message };
  }

  return { ok: true as const };
}
