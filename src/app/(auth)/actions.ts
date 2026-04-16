"use server";

import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";

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

  // Gate pending / rejected accounts before redirecting to the dashboard.
  // Sign the user straight back out so no protected routes are accessible.
  const { data: profile } = await supabase
    .from("users")
    .select("account_status")
    .eq("id", data.user?.id ?? "")
    .single();

  const status = (profile as { account_status?: string } | null)
    ?.account_status;
  if (status === "pending") {
    await supabase.auth.signOut();
    return {
      error:
        "Your account is pending admin approval. You will be able to sign in once an admin approves it.",
    };
  }
  if (status === "rejected") {
    await supabase.auth.signOut();
    return {
      error:
        "Your account request was not approved. Please contact an administrator.",
    };
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
  redirect("/dashboard");
}

export async function signup(
  _prevState: AuthState | undefined,
  formData: FormData
): Promise<AuthState | undefined> {
  const fullName = (formData.get("full_name") as string | null)?.trim() ?? "";
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (fullName.length < 2) {
    return { error: "Full name must be at least 2 characters" };
  }
  if (!email) {
    return { error: "Email is required" };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const supabase = await createClient();

  // Create the auth user. If email confirmation is enabled in Supabase
  // this will NOT return a session; the user must click the email link
  // before they can sign in. Either way the admin must still approve
  // the account before any dashboard access is granted.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      return { error: "An account with this email already exists" };
    }
    return { error: error.message };
  }

  if (!data.user) {
    return { error: "Failed to create account" };
  }

  // Upsert the public.users profile with account_status='pending'.
  // Use the admin client so this works whether or not Supabase returned
  // a session (email-confirm mode) and regardless of the users-insert
  // RLS policy.
  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("users")
    .upsert(
      {
        id: data.user.id,
        email,
        full_name: fullName,
        account_status: "pending",
      },
      { onConflict: "id" }
    );

  if (profileError) {
    return {
      error:
        "Failed to create profile: " +
        profileError.message +
        ". Please contact an administrator.",
    };
  }

  // Do NOT assign a role. The admin picks the role at approval time.

  // If Supabase auto-confirmed the signup it also returned a session;
  // sign the user straight back out so they can't land on protected
  // routes while still pending approval.
  if (data.session) {
    await supabase.auth.signOut();
  }

  return {
    success:
      "Thanks! Your account has been created and is waiting for admin approval. You'll be able to sign in once it's approved.",
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
