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
  const role = formData.get("role") as string;
  const isResidentField = formData.get("is_resident");
  const isResident = role === "resident" || isResidentField === "on" || isResidentField === "true";

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    phone: formData.get("phone") || undefined,
    role,
    is_resident: isResident,
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
    is_resident: isResident,
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
    houseId: undefined,
    eventType: "user_created",
    entityType: "user",
    entityId: authData.user.id,
    description: `User "${parsed.data.full_name}" (${parsed.data.role}${isResident ? ", resident" : ""}) created by ${user.full_name}`,
  });

  revalidatePath("/users");
  revalidatePath("/residents");
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

  // First, clean up tables that reference users(id) with ON DELETE CASCADE or SET NULL
  // These are safe to delete because they don't block the users row deletion
  // Tables with ON DELETE CASCADE on user_id: user_roles, manager_house_assignments
  // Tables with ON DELETE SET NULL on user_id: residents

  // Try to delete the users row first to check for FK constraint violations
  // If it fails, we haven't touched any data yet — safe fallback to soft-delete
  // First remove child records that have CASCADE or won't cause issues
  await adminClient.from("residents").delete().eq("user_id", userId);
  await adminClient.from("manager_house_assignments").delete().eq("user_id", userId);
  await adminClient.from("user_roles").delete().eq("user_id", userId);

  // Attempt the users table delete
  const { error: dbError } = await adminClient
    .from("users")
    .delete()
    .eq("id", userId);

  if (dbError) {
    // FK constraint violation — restore the role and soft-delete instead
    // Re-create the user_roles record since we deleted it above
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (!roleData) {
      // Restore default role since we deleted it
      await adminClient.from("user_roles").insert({ user_id: userId, role: "resident" });
    }

    // Soft-delete: deactivate instead
    await adminClient
      .from("users")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", userId);

    await logActivity({
      actorId: user.id,
      eventType: "user_deactivated",
      entityType: "user",
      entityId: userId,
      description: `User "${targetUser?.full_name}" (${targetUser?.email}) deactivated by ${user.full_name} (has activity references, cannot hard-delete)`,
    });

    revalidatePath("/users");
    return { error: "This user has activity records and cannot be fully deleted. They have been deactivated instead." };
  }

  // Users row deleted successfully — clean up auth
  const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("Failed to delete auth user:", authError.message);
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

  const isResident = formData.get("is_resident") === "on";

  const parsed = updateUserProfileSchema.safeParse({
    full_name: formData.get("full_name") || undefined,
    phone: formData.has("phone") ? (formData.get("phone") || null) : undefined,
    role: formData.get("role") || undefined,
    is_resident: isResident,
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

  // Handle resident profile creation/update when is_resident is checked
  if (isResident || parsed.data.role === "resident") {
    const residentHouseId = formData.get("resident_house_id") as string;
    const residentMoveInDate = formData.get("resident_move_in_date") as string;
    const residentSobrietyDate = formData.get("resident_sobriety_date") as string;
    const residentDateOfBirth = formData.get("resident_date_of_birth") as string;
    const residentEmergencyName = formData.get("resident_emergency_contact_name") as string;
    const residentEmergencyPhone = formData.get("resident_emergency_contact_phone") as string;
    const residentEmergencyRelationship = formData.get("resident_emergency_contact_relationship") as string;

    if (!residentHouseId || !residentMoveInDate || !residentEmergencyName || !residentEmergencyPhone) {
      return { error: "House, move-in date, and emergency contact are required for residents" };
    }

    // Get user info for resident record
    const { data: targetUserData } = await adminClient
      .from("users")
      .select("full_name, email, phone")
      .eq("id", userId)
      .single();

    // Check if a residents record already exists
    const { data: existingResident } = await adminClient
      .from("residents")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const residentData = {
      house_id: residentHouseId,
      full_name: parsed.data.full_name ?? targetUserData?.full_name ?? "",
      phone: parsed.data.phone ?? targetUserData?.phone ?? null,
      email: targetUserData?.email ?? null,
      move_in_date: residentMoveInDate,
      sobriety_date: residentSobrietyDate || null,
      date_of_birth: residentDateOfBirth || null,
      emergency_contact_name: residentEmergencyName,
      emergency_contact_phone: residentEmergencyPhone,
      emergency_contact_relationship: residentEmergencyRelationship || null,
      status: "active" as const,
    };

    if (existingResident) {
      // Update existing record
      const { error: resUpdateError } = await adminClient
        .from("residents")
        .update(residentData)
        .eq("id", existingResident.id);

      if (resUpdateError) return { error: `Failed to update resident profile: ${resUpdateError.message}` };
    } else {
      // Create new record linked to user
      const { error: resInsertError } = await adminClient
        .from("residents")
        .insert({ ...residentData, user_id: userId });

      if (resInsertError) return { error: `Failed to create resident profile: ${resInsertError.message}` };
    }
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
  revalidatePath("/residents");
  return {};
}
