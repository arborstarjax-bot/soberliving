"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase.auth.signInWithPassword({
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

  redirect("/dashboard");
}

export async function signup(
  _prevState: AuthState | undefined,
  formData: FormData
): Promise<AuthState | undefined> {
  const fullName = formData.get("full_name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!fullName || fullName.trim().length < 2) {
    return { error: "Full name must be at least 2 characters" };
  }
  if (!email) {
    return { error: "Email is required" };
  }
  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  const supabase = await createClient();

  // Create the auth user
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "An account with this email already exists" };
    }
    return { error: error.message };
  }

  if (!data.user) {
    return { error: "Failed to create account" };
  }

  // Insert into public.users table
  const { error: profileError } = await supabase
    .from("users")
    .insert({
      id: data.user.id,
      email,
      full_name: fullName.trim(),
    });

  if (profileError) {
    // If the profile insert fails, the auth user still exists.
    // Log the error but don't block — the user can still log in
    // and an admin can fix the profile later.
    console.error("Failed to create user profile:", profileError.message);
  }

  // Assign default resident role
  const { error: roleError } = await supabase
    .from("user_roles")
    .insert({
      user_id: data.user.id,
      role: "resident",
    });

  if (roleError) {
    console.error("Failed to assign default role:", roleError.message);
  }

  // If email confirmation is required, show success message
  if (data.user.identities?.length === 0) {
    return { success: "Check your email for a confirmation link" };
  }

  // If auto-confirmed, redirect to dashboard
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
