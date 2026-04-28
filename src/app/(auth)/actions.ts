"use server";

import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateSlug } from "@/lib/workspace";

interface AuthState {
  error?: string;
  success?: string;
}

export async function login(
  _prevState: AuthState | undefined,
  formData: FormData
): Promise<AuthState | undefined> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message === "Invalid login credentials") {
      return { error: "Invalid email or password" };
    }
    if (error.message === "Email not confirmed") {
      return { error: "Please confirm your email address before signing in" };
    }
    return { error: error.message };
  }

  // Gate rejected / denied accounts before redirecting. Pending is no
  // longer a supported state — new signups are auto-active and advance
  // to intake; denial flips them to 'rejected' from Intake Review.
  const { data: profile } = await supabase
    .from("users")
    .select("account_status")
    .eq("id", data.user?.id ?? "")
    .single();

  const status = (profile as { account_status?: string } | null)
    ?.account_status;
  if (status === "rejected") {
    redirect("/application-denied");
  }
  if (status && status !== "active") {
    await supabase.auth.signOut();
    return { error: "Your account is not active. Please contact an administrator." };
  }

  // Redirect based on role
  const { data: roleRecord } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user?.id ?? "")
    .single();

  const role = roleRecord?.role ?? "resident";
  if (role === "admin" || role === "manager") {
    redirect("/admin");
  }
  // Discharged residents (any residents row exists but none are
  // active) land on the lockout page instead of the dashboard.
  const admin = createAdminClient();
  const { data: residentRows } = await admin
    .from("residents")
    .select("status")
    .eq("user_id", data.user?.id ?? "");
  const rows = residentRows ?? [];
  if (rows.length > 0 && rows.every((r) => r.status !== "active")) {
    redirect("/discharged");
  }
  redirect("/dashboard");
}

export async function signup(
  _prevState: AuthState | undefined,
  formData: FormData
): Promise<AuthState | undefined> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const workspaceName = (formData.get("workspace_name") as string | null)?.trim() ?? "";
  const inviteToken = (formData.get("invite_token") as string | null)?.trim() ?? "";

  if (!email) {
    return { error: "Email is required" };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const isInviteFlow = !!inviteToken;

  // If creating a workspace, name is required
  if (!isInviteFlow && !workspaceName) {
    return { error: "Workspace name is required" };
  }

  const adminClient = createAdminClient();

  // Validate invite token if present
  let invite: {
    id: string;
    workspace_id: string;
    role: string;
    email: string;
  } | null = null;

  if (isInviteFlow) {
    const { data: inviteRow } = await adminClient
      .from("workspace_invites")
      .select("id, workspace_id, role, email, accepted_at, expires_at")
      .eq("token", inviteToken)
      .maybeSingle();

    if (!inviteRow) {
      return { error: "Invalid invite link" };
    }
    if (inviteRow.accepted_at) {
      return { error: "This invite has already been used" };
    }
    if (new Date(inviteRow.expires_at) < new Date()) {
      return { error: "This invite has expired" };
    }
    if (inviteRow.email.toLowerCase() !== email.toLowerCase()) {
      return { error: "This invite was sent to a different email address" };
    }
    invite = inviteRow;
  }

  const fullName = email.split("@")[0] || email;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("user already")) {
      return { error: "An account with this email already exists" };
    }
    return { error: error.message };
  }

  if (!data.user) {
    return { error: "Failed to create account" };
  }

  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: "An account with this email already exists" };
  }

  // Determine the role to assign
  const userRole = isInviteFlow ? (invite!.role === "admin" || invite!.role === "owner" ? "admin" : invite!.role) : "admin";

  // Create profile
  const { error: profileError } = await adminClient
    .from("users")
    .upsert(
      {
        id: data.user.id,
        email,
        full_name: fullName,
        account_status: "active",
      },
      { onConflict: "id" }
    );

  if (profileError) {
    await adminClient.auth.admin.deleteUser(data.user.id).catch(() => {});
    return { error: "Failed to create profile: " + profileError.message + ". Please try again." };
  }

  // Assign user_roles row
  const { error: roleError } = await adminClient
    .from("user_roles")
    .upsert(
      { user_id: data.user.id, role: userRole as "admin" | "manager" | "resident" },
      { onConflict: "user_id" }
    );

  if (roleError) {
    await adminClient.from("users").delete().eq("id", data.user.id);
    await adminClient.auth.admin.deleteUser(data.user.id).catch(() => {});
    return { error: "Failed to assign role: " + roleError.message + ". Please try again." };
  }

  if (isInviteFlow && invite) {
    // Join existing workspace
    const { error: memberError } = await adminClient
      .from("workspace_members")
      .insert({
        workspace_id: invite.workspace_id,
        user_id: data.user.id,
        role: invite.role,
        invited_by: null,
      });

    if (memberError) {
      return { error: "Failed to join workspace: " + memberError.message };
    }

    // Update user's workspace_id
    await adminClient
      .from("users")
      .update({ workspace_id: invite.workspace_id })
      .eq("id", data.user.id);

    // Mark invite as accepted
    await adminClient
      .from("workspace_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
  } else {
    // Create new workspace
    const slug = generateSlug(workspaceName) + "-" + Date.now().toString(36);
    const { data: workspace, error: wsError } = await adminClient
      .from("workspaces")
      .insert({
        name: workspaceName,
        slug,
        owner_id: data.user.id,
      })
      .select("id")
      .single();

    if (wsError || !workspace) {
      return { error: "Failed to create workspace: " + (wsError?.message ?? "Unknown error") };
    }

    // Add creator as owner member
    const { error: ownerError } = await adminClient.from("workspace_members").insert({
      workspace_id: workspace.id,
      user_id: data.user.id,
      role: "owner",
    });

    if (ownerError) {
      await adminClient.from("workspaces").delete().eq("id", workspace.id);
      return { error: "Failed to set up workspace membership: " + ownerError.message };
    }

    // Create default settings
    const { error: settingsError } = await adminClient.from("workspace_settings").insert({
      workspace_id: workspace.id,
    });

    if (settingsError) {
      return { error: "Failed to create workspace settings: " + settingsError.message };
    }

    // Create default payment config
    const { error: payConfigError } = await adminClient.from("workspace_payment_config").insert({
      workspace_id: workspace.id,
    });

    if (payConfigError) {
      return { error: "Failed to create payment config: " + payConfigError.message };
    }

    // Update user's workspace_id
    const { error: userWsError } = await adminClient
      .from("users")
      .update({ workspace_id: workspace.id })
      .eq("id", data.user.id);

    if (userWsError) {
      return { error: "Failed to link workspace to user: " + userWsError.message };
    }
  }

  // Handle session / email confirmation
  if (!data.session) {
    if (!data.user.email_confirmed_at) {
      return {
        success:
          "Account created. Please check your email to confirm your address, then sign in.",
      };
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      return {
        success: "Account created. Please sign in to continue.",
      };
    }
  }

  // Route based on role
  if (userRole === "admin" || userRole === "manager") {
    redirect("/admin");
  }
  redirect("/dashboard");
}
