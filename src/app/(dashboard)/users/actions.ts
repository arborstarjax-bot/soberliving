"use server";
import { err, ok, okVoid, type ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { isUserInWorkspace } from "@/lib/workspace";
import type { UserRole } from "@/lib/types";

const VALID_ROLES: UserRole[] = ["admin", "manager", "resident"];
import { logActivity } from "@/lib/activity";
import { createUserSchema, assignManagerSchema, updateUserProfileSchema } from "@/lib/validations";
import { sendInviteEmail } from "@/lib/email";
import { getAppOrigin } from "@/lib/app-url";

export async function createUser(
  _prevState: { error?: string; inviteLink?: string } | undefined,
  formData: FormData
) {
  // Allow both admins and managers to invite residents
  const user = await requireAuth();
  if (user.role === "resident") return err("Not authorized");

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name") || undefined,
    phone: formData.get("phone") || undefined,
  });
  const houseId = (formData.get("house_id") as string) || null;

  // Staff can only assign residents to houses in their own workspace
  // (admins) or houses they manage (managers).
  if (houseId && !canAccessHouse(user, houseId)) {
    return err("Not authorized for this house");
  }

  if (!parsed.success) return err(parsed.error.issues[0].message);

  const adminClient = createAdminClient();
  const baseUrl = await getAppOrigin();

  // Generate an invite link via Supabase admin API (requires service role key)
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: parsed.data.email,
    options: {
      redirectTo: `${baseUrl}/reset-password`,
    },
  });

  if (linkError) return err(linkError.message);

  const authUserId = linkData.user.id;

  // A DB trigger auto-provisions the public users row when the auth user
  // is created, so `existingUser` is set on every invite — existence alone
  // says nothing. The real gate is workspace membership: another
  // workspace's account must never get a membership or link here (tenant
  // isolation), a member of THIS workspace is a re-invite, and an account
  // with no membership anywhere is fresh and gets fully provisioned.
  const { data: memberships } = await adminClient
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", authUserId)
    .eq("status", "active");
  const inAnotherWorkspace = (memberships ?? []).some(
    (m) => m.workspace_id !== user.workspace_id
  );
  const inThisWorkspace = (memberships ?? []).some(
    (m) => m.workspace_id === user.workspace_id
  );

  if (inAnotherWorkspace) {
    return err("A user with this email already exists");
  }
  const isReinvite = inThisWorkspace;

  if (!isReinvite) {
    // Create user record (service client — the invite is a staff action,
    // not the new user writing their own row). Upsert guards the race where
    // a trigger or a concurrent invite already wrote the row.
    const { error: userError } = await adminClient.from("users").upsert(
      {
        id: authUserId,
        email: parsed.data.email,
        full_name: parsed.data.full_name || parsed.data.email.split("@")[0],
        phone: parsed.data.phone ?? null,
        // Admin-invited users are pre-approved; mark active so they aren't
        // blocked by the getSessionUser account_status gate.
        account_status: "active",
        ...(houseId ? { pending_house_id: houseId } : {}),
      },
      { onConflict: "id" }
    );

    if (userError) return err(userError.message);

    // Default role is resident
    const { error: roleError } = await adminClient.from("user_roles").upsert(
      { user_id: authUserId, role: "resident" },
      { onConflict: "user_id" }
    );

    if (roleError) return err(roleError.message);

    // Workspace membership is the role/workspace trust anchor.
    if (user.workspace_id) {
      await adminClient.from("workspace_members").upsert(
        {
          workspace_id: user.workspace_id,
          user_id: authUserId,
          role: "resident",
          status: "active",
          invited_by: user.id,
        },
        { onConflict: "workspace_id,user_id" }
      );
      await adminClient
        .from("users")
        .update({ workspace_id: user.workspace_id })
        .eq("id", authUserId);
    }
  }

  await logActivity({
    actorId: user.id,
    eventType: isReinvite ? "user_reinvited" : "user_created",
    entityType: "user",
    entityId: authUserId,
    description: isReinvite
      ? `Resident "${parsed.data.email}" re-invited by ${user.full_name}`
      : `Resident "${parsed.data.email}" invited by ${user.full_name}`,
  });

  revalidatePath("/users");
  revalidatePath("/residents");

  // Use the action_link from Supabase (contains tokens in the URL).
  // Rewrite the redirect so it lands on our /reset-password page where
  // the user can set their password.
  let inviteLink = linkData.properties?.action_link ?? "";

  if (inviteLink) {
    // The action_link redirects to Supabase's default. We rewrite the
    // redirect_to query param so it ends up on /reset-password in our app.
    try {
      const url = new URL(inviteLink);
      url.searchParams.set("redirect_to", `${baseUrl}/reset-password`);
      inviteLink = url.toString();
    } catch {
      // If URL parsing fails, fall back to the raw link
    }
  } else {
    inviteLink = `${baseUrl}/login`;
  }

  // Send invite email via Resend (best-effort — don't fail the whole action if email fails)
  try {
    await sendInviteEmail({
      to: parsed.data.email,
      fullName: parsed.data.full_name || parsed.data.email.split("@")[0],
      role: "resident",
      inviteLink,
      appUrl: baseUrl,
    });
  } catch {
    // Email send failed — admin can still share the link manually
  }

  return ok({ inviteLink });
}

/**
 * Re-generate a Supabase invite link for an already-invited user who
 * hasn't set their password yet, and re-send the invite email. Used
 * by the Intake lifecycle list on /residents so staff can nudge a
 * stalled applicant without going through the New Resident dialog
 * (which would create a duplicate user record).
 */
export async function resendInviteLink(
  userId: string
): Promise<{ error?: string; inviteLink?: string }> {
  const user = await requireAuth();
  if (user.role === "resident") return err("Not authorized");

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: target, error: targetError } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("id", userId)
    .single();

  if (targetError || !target?.email) {
    return err("User not found");
  }

  // Only mint invite links for users inside the caller's workspace.
  if (!(await isUserInWorkspace(user, userId))) {
    return err("User not found");
  }

  const baseUrl = await getAppOrigin();
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: target.email,
    options: {
      redirectTo: `${baseUrl}/reset-password`,
    },
  });

  if (linkError) return err(linkError.message);

  let inviteLink = linkData.properties?.action_link ?? "";
  if (inviteLink) {
    try {
      const url = new URL(inviteLink);
      url.searchParams.set("redirect_to", `${baseUrl}/reset-password`);
      inviteLink = url.toString();
    } catch {
      // fall back to raw link
    }
  } else {
    inviteLink = `${baseUrl}/login`;
  }

  try {
    await sendInviteEmail({
      to: target.email,
      fullName: target.full_name || target.email.split("@")[0],
      role: "resident",
      inviteLink,
      appUrl: baseUrl,
    });
  } catch {
    // Email send failed — staff can still share the link manually
  }

  await logActivity({
    actorId: user.id,
    eventType: "user_reinvited",
    entityType: "user",
    entityId: userId,
    description: `Invite link re-sent to ${target.email} by ${user.full_name}`,
  });

  revalidatePath("/residents");
  revalidatePath("/users");

  return ok({ inviteLink });
}

export async function changeUserRole(userId: string, newRole: string) {
  const user = await requireRole("admin");
  if (!VALID_ROLES.includes(newRole as UserRole)) {
    return err("Invalid role");
  }
  if (!(await isUserInWorkspace(user, userId))) {
    return err("User not found");
  }
  const adminClient = createAdminClient();

  // Upsert role record (user_roles is legacy; workspace_members.role is
  // the authoritative source — keep both in sync)
  const { error } = await adminClient
    .from("user_roles")
    .upsert({ user_id: userId, role: newRole }, { onConflict: "user_id" });

  if (error) return err(error.message);

  await adminClient
    .from("workspace_members")
    .update({ role: newRole })
    .eq("workspace_id", user.workspace_id)
    .eq("user_id", userId);

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
  return okVoid();
}

export async function assignManagerToHouses(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireRole("admin");
  const userId = formData.get("user_id") as string;
  const houseIds = formData.getAll("house_ids") as string[];

  const parsed = assignManagerSchema.safeParse({
    user_id: userId,
    house_ids: houseIds,
  });

  if (!parsed.success) return err(parsed.error.issues[0].message);

  // The manager and every target house must live in the caller's workspace.
  if (!(await isUserInWorkspace(user, userId))) {
    return err("User not found");
  }
  for (const houseId of houseIds) {
    if (!canAccessHouse(user, houseId)) {
      return err("Not authorized for this house");
    }
  }

  const adminClient = createAdminClient();

  // Remove existing assignments
  await adminClient
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
    const { error } = await adminClient
      .from("manager_house_assignments")
      .insert(assignments);

    if (error) return err(error.message);
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
  return okVoid();
}

export async function updateUserProfile(
  _prevState: ActionResult | undefined,
  formData: FormData
) {
  const user = await requireRole("admin");
  const userId = formData.get("user_id") as string;

  if (!userId) return err("User ID is required");
  if (!(await isUserInWorkspace(user, userId))) {
    return err("User not found");
  }

  const parsed = updateUserProfileSchema.safeParse({
    full_name: formData.get("full_name") || undefined,
    phone: formData.get("phone") || undefined,
    role: formData.get("role") || undefined,
  });

  if (!parsed.success) return err(parsed.error.issues[0].message);

  const adminClient = createAdminClient();

  // Update user record
  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.full_name) updateFields.full_name = parsed.data.full_name;
  if (parsed.data.phone !== undefined) updateFields.phone = parsed.data.phone ?? null;

  const { error: userError } = await adminClient
    .from("users")
    .update(updateFields)
    .eq("id", userId);

  if (userError) return err(userError.message);

  // Update role if provided
  if (parsed.data.role) {
    if (!VALID_ROLES.includes(parsed.data.role as UserRole)) {
      return err("Invalid role");
    }
    const { error: roleError } = await adminClient
      .from("user_roles")
      .upsert({ user_id: userId, role: parsed.data.role }, { onConflict: "user_id" });

    if (roleError) return err(roleError.message);

    await adminClient
      .from("workspace_members")
      .update({ role: parsed.data.role })
      .eq("workspace_id", user.workspace_id)
      .eq("user_id", userId);
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
  return okVoid();
}

export async function deactivateUser(userId: string) {
  const user = await requireRole("admin");
  if (userId === user.id) return err("Cannot deactivate yourself");
  if (!(await isUserInWorkspace(user, userId))) {
    return err("User not found");
  }

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("users")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return err(error.message);

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
  return okVoid();
}
