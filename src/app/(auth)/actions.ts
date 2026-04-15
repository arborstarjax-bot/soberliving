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

// Self-registration is disabled — users are created via admin invite only.
// This action is intentionally disabled to prevent unauthorized account creation.
export async function signup(
  _prevState: AuthState | undefined,
  _formData: FormData
): Promise<AuthState | undefined> {
  return { error: "Self-registration is disabled. Please contact an administrator for an invite." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
