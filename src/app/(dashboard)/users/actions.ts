"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createUserSchema, assignManagerSchema } from "@/lib/validations";
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
  const supabase = await createClient();

  // Upsert role record
  const { error } = await supabase
    .from("user_roles")
    .upsert({ user_id: userId, role: newRole }, { onConflict: "user_id" });

  if (error) return { error: error.message };

  const { data: targetUser } = await supabase
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

  const supabase = await createClient();

  // Remove existing assignments
  await supabase
    .from("manager_house_assignments")
    .update({ unassigned_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("unassigned_at", null);

  // Create new assignments
  const assignments = houseIds.map((houseId) => ({
    user_id: userId,
    house_id: houseId,
  }));

  const { error } = await supabase
    .from("manager_house_assignments")
    .insert(assignments);

  if (error) return { error: error.message };

  const { data: targetUser } = await supabase
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

  const supabase = await createClient();

  const { error } = await supabase
    .from("users")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { error: error.message };

  const { data: targetUser } = await supabase
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
