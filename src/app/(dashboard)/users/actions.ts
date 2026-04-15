"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createUserSchema, assignManagerSchema, updateUserProfileSchema } from "@/lib/validations";
import { sendInviteEmail } from "@/lib/email";

export async function createUser(
  _prevState: { error?: string; inviteLink?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole("admin");
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // Generate an invite link (also sends email) via Supabase admin API
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "invite",
    email: parsed.data.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });

  if (linkError) return { error: linkError.message };

  const authUserId = linkData.user.id;

  // Create user record
  const { error: userError } = await supabase.from("users").insert({
    id: authUserId,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    phone: parsed.data.phone ?? null,
  });

  if (userError) return { error: userError.message };

  // Default role is resident
  const { error: roleError } = await supabase.from("user_roles").insert({
    user_id: authUserId,
    role: "resident",
  });

  if (roleError) return { error: roleError.message };

  await logActivity({
    actorId: user.id,
    eventType: "user_created",
    entityType: "user",
    entityId: authUserId,
    description: `Resident "${parsed.data.full_name}" invited by ${user.full_name}`,
  });

  revalidatePath("/users");
  revalidatePath("/residents");

  // Build the invite link from the token properties
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const token = linkData.properties?.hashed_token;
  const inviteLink = token
    ? `${baseUrl}/auth/confirm?token_hash=${token}&type=invite`
    : `${baseUrl}/login`;

  // Send invite email via Resend (best-effort — don't fail the whole action if email fails)
  try {
    await sendInviteEmail({
      to: parsed.data.email,
      fullName: parsed.data.full_name,
      role: "resident",
      inviteLink,
    });
  } catch {
    // Email send failed — admin can still share the link manually
  }

  return { inviteLink };
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

  // Create new assignments (skip insert if no houses selected — "unassign all" case)
  const assignments = houseIds.map((houseId) => ({
    user_id: userId,
    house_id: houseId,
  }));

  if (assignments.length > 0) {
    const { error } = await supabase
      .from("manager_house_assignments")
      .insert(assignments);

    if (error) return { error: error.message };
  }

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

export async function updateUserProfile(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole("admin");
  const userId = formData.get("user_id") as string;

  if (!userId) return { error: "User ID is required" };

  const parsed = updateUserProfileSchema.safeParse({
    full_name: formData.get("full_name") || undefined,
    phone: formData.get("phone") || undefined,
    role: formData.get("role") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // Update user record
  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.full_name) updateFields.full_name = parsed.data.full_name;
  if (parsed.data.phone !== undefined) updateFields.phone = parsed.data.phone ?? null;

  const { error: userError } = await supabase
    .from("users")
    .update(updateFields)
    .eq("id", userId);

  if (userError) return { error: userError.message };

  // Update role if provided
  if (parsed.data.role) {
    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role: parsed.data.role }, { onConflict: "user_id" });

    if (roleError) return { error: roleError.message };
  }

  await logActivity({
    actorId: user.id,
    eventType: "user_updated",
    entityType: "user",
    entityId: userId,
    description: `User profile updated by ${user.full_name}`,
  });

  revalidatePath(`/users/${userId}`);
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
