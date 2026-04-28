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
    .select("account_status, workspace_id")
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

  // Check if workspace membership was denied
  const adminClient = createAdminClient();
  const userWsId = (profile as { workspace_id?: string | null } | null)?.workspace_id;
  let membershipQuery = adminClient
    .from("workspace_members")
    .select("status")
    .eq("user_id", data.user?.id ?? "");
  if (userWsId) {
    membershipQuery = membershipQuery.eq("workspace_id", userWsId);
  }
  const { data: membership } = await membershipQuery
    .limit(1)
    .maybeSingle();

  if (membership?.status === "denied") {
    await supabase.auth.signOut();
    return { error: "Your request to join this workspace was denied. Please contact the administrator." };
  }

  // Pending members are allowed through — they can still complete
  // intake/quick-signup. The dashboard layout gates them after that.

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
  const { data: residentRows } = await adminClient
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
  const fullName = (formData.get("full_name") as string | null)?.trim() ?? "";
  const workspaceName = (formData.get("workspace_name") as string | null)?.trim() ?? "";
  const workspaceCode = (formData.get("workspace_code") as string | null)?.trim() ?? "";

  if (!email) {
    return { error: "Email is required" };
  }
  if (!fullName) {
    return { error: "Full name is required" };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const isJoinFlow = !!workspaceCode;

  // If creating a workspace, name is required
  if (!isJoinFlow && !workspaceName) {
    return { error: "Workspace name is required" };
  }

  const adminClient = createAdminClient();

  // Validate workspace invite code if joining
  let workspace: { id: string; name: string } | null = null;

  if (isJoinFlow) {
    const { data: wsRow } = await adminClient
      .from("workspaces")
      .select("id, name")
      .eq("invite_code", workspaceCode)
      .maybeSingle();

    if (!wsRow) {
      return { error: "Invalid invite link. Please check with your administrator." };
    }
    workspace = wsRow;
  }

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
  const userRole = isJoinFlow ? "resident" : "admin";

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

  if (isJoinFlow && workspace) {
    // Join workspace with PENDING status — admin must approve
    const { error: memberError } = await adminClient
      .from("workspace_members")
      .insert({
        workspace_id: workspace.id,
        user_id: data.user.id,
        role: "resident",
        status: "pending",
      });

    if (memberError) {
      return { error: "Failed to request workspace access: " + memberError.message };
    }

    // Update user's workspace_id
    await adminClient
      .from("users")
      .update({ workspace_id: workspace.id })
      .eq("id", data.user.id);
  } else {
    // Create new workspace
    const slug = generateSlug(workspaceName) + "-" + Date.now().toString(36);
    const { data: newWorkspace, error: wsError } = await adminClient
      .from("workspaces")
      .insert({
        name: workspaceName,
        slug,
        owner_id: data.user.id,
      })
      .select("id")
      .single();

    if (wsError || !newWorkspace) {
      return { error: "Failed to create workspace: " + (wsError?.message ?? "Unknown error") };
    }

    // Add creator as owner member (active immediately)
    const { error: ownerError } = await adminClient.from("workspace_members").insert({
      workspace_id: newWorkspace.id,
      user_id: data.user.id,
      role: "owner",
      status: "active",
    });

    if (ownerError) {
      await adminClient.from("workspaces").delete().eq("id", newWorkspace.id);
      return { error: "Failed to set up workspace membership: " + ownerError.message };
    }

    // Create default settings
    const { error: settingsError } = await adminClient.from("workspace_settings").insert({
      workspace_id: newWorkspace.id,
    });

    if (settingsError) {
      await adminClient.from("workspace_members").delete().eq("workspace_id", newWorkspace.id);
      await adminClient.from("workspaces").delete().eq("id", newWorkspace.id);
      await adminClient.from("user_roles").delete().eq("user_id", data.user.id);
      await adminClient.from("users").delete().eq("id", data.user.id);
      await adminClient.auth.admin.deleteUser(data.user.id).catch(() => {});
      return { error: "Failed to create workspace settings: " + settingsError.message + ". Please try again." };
    }

    // Create default payment config
    const { error: payConfigError } = await adminClient.from("workspace_payment_config").insert({
      workspace_id: newWorkspace.id,
    });

    if (payConfigError) {
      await adminClient.from("workspace_settings").delete().eq("workspace_id", newWorkspace.id);
      await adminClient.from("workspace_members").delete().eq("workspace_id", newWorkspace.id);
      await adminClient.from("workspaces").delete().eq("id", newWorkspace.id);
      await adminClient.from("user_roles").delete().eq("user_id", data.user.id);
      await adminClient.from("users").delete().eq("id", data.user.id);
      await adminClient.auth.admin.deleteUser(data.user.id).catch(() => {});
      return { error: "Failed to create payment config: " + payConfigError.message + ". Please try again." };
    }

    // Update user's workspace_id
    const { error: userWsError } = await adminClient
      .from("users")
      .update({ workspace_id: newWorkspace.id })
      .eq("id", data.user.id);

    if (userWsError) {
      await adminClient.from("workspace_payment_config").delete().eq("workspace_id", newWorkspace.id);
      await adminClient.from("workspace_settings").delete().eq("workspace_id", newWorkspace.id);
      await adminClient.from("workspace_members").delete().eq("workspace_id", newWorkspace.id);
      await adminClient.from("workspaces").delete().eq("id", newWorkspace.id);
      await adminClient.from("user_roles").delete().eq("user_id", data.user.id);
      await adminClient.from("users").delete().eq("id", data.user.id);
      await adminClient.auth.admin.deleteUser(data.user.id).catch(() => {});
      return { error: "Failed to link workspace to user: " + userWsError.message + ". Please try again." };
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

  // Route based on role — workspace creator is always admin
  if (userRole === "admin") {
    redirect("/admin");
  }
  redirect("/dashboard");
}
