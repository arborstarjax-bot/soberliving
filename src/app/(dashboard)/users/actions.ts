"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createUserSchema, assignManagerSchema, updateUserProfileSchema } from "@/lib/validations";
import { sendInviteEmail } from "@/lib/email";
import crypto from "crypto";

function generateTempPassword(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export async function createUser(
  _prevState: { error?: string; inviteLink?: string; emailSent?: boolean; emailError?: string | null } | undefined,
  formData: FormData
) {
  const user = await requireRole("admin");
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    phone: formData.get("phone") || undefined,
    role: formData.get("role"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const adminClient = createAdminClient();
  const tempPassword = generateTempPassword();

  // Create auth user with auto-generated password (requires service role)
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: tempPassword,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message.includes("already been registered")) {
      return { error: "A user with this email already exists" };
    }
    return { error: authError.message };
  }

  // Create user record (upsert to handle handle_new_user trigger race)
  const { error: userError } = await adminClient.from("users").upsert({
    id: authData.user.id,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    phone: parsed.data.phone ?? null,
  }, { onConflict: "id" });

  if (userError) {
    if (userError.code === "23505") {
      return { error: "A user with this email already exists" };
    }
    return { error: userError.message };
  }

  // Create role record (upsert to handle handle_new_user trigger race)
  const { error: roleError } = await adminClient.from("user_roles").upsert({
    user_id: authData.user.id,
    role: parsed.data.role,
  }, { onConflict: "user_id" });

  if (roleError) return { error: roleError.message };

  // Generate a password recovery link so the user can set their own password
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: parsed.data.email,
    options: {
      redirectTo: `${appUrl}/api/auth/callback?type=recovery`,
    },
  });

  let inviteLink = "";
  if (!linkError && linkData?.properties?.action_link) {
    inviteLink = linkData.properties.action_link;
  }

  // Send invite email via Resend
  let emailSent = false;
  let emailError: string | null = null;
  if (inviteLink && process.env.RESEND_API_KEY) {
    const result = await sendInviteEmail({
      to: parsed.data.email,
      fullName: parsed.data.full_name,
      role: parsed.data.role,
      inviteLink,
    });
    emailSent = !result.error;
    emailError = result.error;
    if (result.error) {
      console.error("Failed to send invite email:", result.error);
    }
  }

  await logActivity({
    actorId: user.id,
    eventType: "user_created",
    entityType: "user",
    entityId: authData.user.id,
    description: `User "${parsed.data.full_name}" (${parsed.data.role}) created by ${user.full_name}`,
  });

  revalidatePath("/users");
  return { inviteLink, emailSent, emailError };
}

export async function changeUserRole(userId: string, newRole: string) {
  const user = await requireRole("admin");
  if (userId === user.id) return { error: "Cannot change your own role" };

  const adminClient = createAdminClient();

  // Upsert role record
  const { error } = await adminClient
    .from("user_roles")
    .upsert({ user_id: userId, role: newRole }, { onConflict: "user_id" });

  if (error) return { error: error.message };

  const { data: targetUser } = await adminClient
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .single();

  await logActivity({
    actorId: user.id,
    eventType: "role_changed",
    entityType: "user",
    entityId: userId,
    description: `${targetUser?.full_name}'s role changed to ${newRole} by ${user.full_name}`,
  });

  revalidatePath("/users");
  return {};
}

export async function deleteUser(userId: string) {
  const user = await requireRole("admin");
  if (userId === user.id) return { error: "Cannot delete yourself" };

  const adminClient = createAdminClient();

  // Get user info for logging before deletion
  const { data: targetUser } = await adminClient
    .from("users")
    .select("full_name, email")
    .eq("id", userId)
    .single();

  // Delete from manager_house_assignments
  await adminClient
    .from("manager_house_assignments")
    .delete()
    .eq("user_id", userId);

  // Delete from user_roles
  await adminClient
    .from("user_roles")
    .delete()
    .eq("user_id", userId);

  // Delete from users table
  const { error: dbError } = await adminClient
    .from("users")
    .delete()
    .eq("id", userId);

  if (dbError) return { error: dbError.message };

  // Delete from Supabase Auth
  const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("Failed to delete auth user:", authError.message);
    // Don't return error since DB records are already deleted
  }

  await logActivity({
    actorId: user.id,
    eventType: "user_deleted",
    entityType: "user",
    entityId: userId,
    description: `User "${targetUser?.full_name}" (${targetUser?.email}) permanently deleted by ${user.full_name}`,
  });

  revalidatePath("/users");
  return {};
}

export async function resendInviteLink(userId: string) {
  const user = await requireRole("admin");
  const adminClient = createAdminClient();

  // Get user email and name
  const { data: targetUser, error: fetchError } = await adminClient
    .from("users")
    .select("email, full_name")
    .eq("id", userId)
    .single();

  if (fetchError || !targetUser) return { error: "User not found" };

  // Get user role
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  const role = roleData?.role ?? "resident";

  // Generate a new password recovery link
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: targetUser.email,
    options: {
      redirectTo: `${appUrl}/api/auth/callback?type=recovery`,
    },
  });

  if (linkError) return { error: linkError.message };

  const inviteLink = linkData?.properties?.action_link ?? "";
  if (!inviteLink) return { error: "Failed to generate invite link" };

  // Send invite email via Resend
  let emailSent = false;
  let emailError: string | null = null;
  if (process.env.RESEND_API_KEY) {
    const result = await sendInviteEmail({
      to: targetUser.email,
      fullName: targetUser.full_name,
      role,
      inviteLink,
    });
    emailSent = !result.error;
    emailError = result.error;
  }

  await logActivity({
    actorId: user.id,
    eventType: "invite_resent",
    entityType: "user",
    entityId: userId,
    description: `Invite link resent to ${targetUser.full_name} by ${user.full_name}`,
  });

  revalidatePath("/users");
  return { inviteLink, emailSent, emailError };
}

export async function assignManagerToHouses(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole("admin");
  const userId = formData.get("user_id") as string;
  const houseIds = formData.getAll("house_ids") as string[];

  const parsed = assignManagerSchema.safeParse({
    user_id: userId,
    house_ids: houseIds,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const adminClient = createAdminClient();

  // Remove existing assignments
  await adminClient
    .from("manager_house_assignments")
    .update({ unassigned_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("unassigned_at", null);

  // Create new assignments (only if houses selected)
  if (houseIds.length > 0) {
    const assignments = houseIds.map((houseId) => ({
      user_id: userId,
      house_id: houseId,
    }));

    const { error } = await adminClient
      .from("manager_house_assignments")
      .insert(assignments);

    if (error) return { error: error.message };
  }

  const { data: targetUser } = await adminClient
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .single();

  await logActivity({
    actorId: user.id,
    eventType: "manager_assigned",
    entityType: "user",
    entityId: userId,
    description: `${targetUser?.full_name} assigned to ${houseIds.length} house(s) by ${user.full_name}`,
  });

  revalidatePath("/users");
  return {};
}

export async function deactivateUser(userId: string) {
  const user = await requireRole("admin");
  if (userId === user.id) return { error: "Cannot deactivate yourself" };

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("users")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { error: error.message };

  const { data: targetUser } = await adminClient
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .single();

  await logActivity({
    actorId: user.id,
    eventType: "user_deactivated",
    entityType: "user",
    entityId: userId,
    description: `${targetUser?.full_name} deactivated by ${user.full_name}`,
  });

  revalidatePath("/users");
  return {};
}

export async function updateUserProfile(
  userId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole("admin");

  const parsed = updateUserProfileSchema.safeParse({
    full_name: formData.get("full_name") || undefined,
    phone: formData.has("phone") ? (formData.get("phone") || null) : undefined,
    role: formData.get("role") || undefined,
    is_resident: formData.get("is_resident") === "on",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const adminClient = createAdminClient();

  // Update user record
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.full_name) updateData.full_name = parsed.data.full_name;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (parsed.data.is_resident !== undefined) updateData.is_resident = parsed.data.is_resident;

  const { error: userError } = await adminClient
    .from("users")
    .update(updateData)
    .eq("id", userId);

  if (userError) return { error: userError.message };

  // Update role if changed and not self
  if (parsed.data.role && userId !== user.id) {
    const { error: roleError } = await adminClient
      .from("user_roles")
      .upsert({ user_id: userId, role: parsed.data.role }, { onConflict: "user_id" });

    if (roleError) return { error: roleError.message };
  }

  const { data: targetUser } = await adminClient
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .single();

  await logActivity({
    actorId: user.id,
    eventType: "user_updated",
    entityType: "user",
    entityId: userId,
    description: `${targetUser?.full_name}'s profile updated by ${user.full_name}`,
  });

  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
  return {};
}
