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
    // Leave the session intact and route them to the application-denied
    // page so they can see the reason staff recorded. That page has its
    // own auth check and signout control — it doesn't require an active
    // account to render.
    redirect("/application-denied");
  }
  if (status && status !== "active") {
    // Catch any unexpected non-active status (e.g. a lingering 'pending'
    // from before the gate was removed). Without this, getSessionUser
    // returns null and requireAuth bounces them back to /login with a
    // valid session cookie — infinite loop.
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
  // The dashboard layout also enforces this gate, but checking
  // here saves one server round-trip on the happy-path sign-in.
  const admin = createAdminClient();
  const { data: residentRows } = await admin
    .from("residents")
    .select("status")
    .eq("user_id", data.user?.id ?? "");
  const rows = residentRows ?? [];
  if (rows.length > 0 && rows.every((r) => r.status !== "active")) {
    redirect("/discharged");
  }
  // Residents land at /dashboard; the dashboard layout handles
  // redirecting them onwards to /intake or /sign-commitment as needed.
  redirect("/dashboard");
}

export async function signup(
  _prevState: AuthState | undefined,
  formData: FormData
): Promise<AuthState | undefined> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!email) {
    return { error: "Email is required" };
  }

  // We no longer collect a name at signup — the authoritative
  // full_name comes from the intake packet's first/middle/last fields
  // and gets written back in src/app/(intake)/actions.ts. Seed the
  // profile with the email local-part so admin lists show something
  // readable until the user completes intake.
  const fullName = email.split("@")[0] || email;
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const supabase = await createClient();

  // Create the auth user. If email confirmation is enabled in Supabase
  // no session is returned; otherwise signUp also signs the user in.
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

  // When Supabase has email confirmation enabled and the email is already
  // registered, signUp() returns a fake user with `identities: []` and no
  // error (intentional, to avoid email enumeration). Detect that so we
  // don't clobber the existing user's profile.
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: "An account with this email already exists" };
  }

  // Create the public profile (active immediately) and the resident role
  // assignment. Staff approves/denies the application from Intake Review
  // after the user submits their intake packet.
  const admin = createAdminClient();
  const { error: profileError } = await admin
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
    // auth.signUp already committed the auth user. If we leave it in
    // place the email is now "taken" but has no profile row, so the
    // user can't re-register and can't log in either (getSessionUser
    // returns null without a profile, which loops them back to
    // /login). Roll the auth user back so they can retry.
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
    return {
      error:
        "Failed to create profile: " +
        profileError.message +
        ". Please try again.",
    };
  }

  const { error: roleError } = await admin
    .from("user_roles")
    .upsert(
      { user_id: data.user.id, role: "resident" },
      { onConflict: "user_id" }
    );

  if (roleError) {
    // Same rollback reasoning as above — plus remove the half-written
    // profile row so a retry starts from a clean slate.
    await admin.from("users").delete().eq("id", data.user.id);
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
    return {
      error:
        "Failed to assign role: " +
        roleError.message +
        ". Please try again.",
    };
  }

  // If Supabase auto-signed the user in (Confirm email is OFF in this
  // project), data.session is already populated and we can fall through
  // to the /dashboard redirect. If not, the user's email still needs
  // confirmation — do NOT attempt signInWithPassword here, since that
  // would try to bypass the confirmation gate. Always surface the
  // "check your email" message so the flow respects whatever the
  // Supabase project's Confirm-email setting is.
  if (!data.session) {
    if (!data.user.email_confirmed_at) {
      return {
        success:
          "Account created. Please check your email to confirm your address, then sign in.",
      };
    }
    // Edge case: email is already confirmed but Supabase didn't hand
    // back a session (e.g. anonymous-to-permanent upgrade). Kick off a
    // normal sign-in so the user lands on /intake on the next tick.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      return {
        success:
          "Account created. Please sign in to continue.",
      };
    }
  }

  // The (dashboard) layout will redirect resident-role + !intake_completed
  // users to /intake, so sending them to /dashboard is fine and keeps the
  // redirect logic centralized.
  redirect("/dashboard");
}
