"use client";

import { useState, useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);
  const initialized = useRef(false);

  // Lazily create the Supabase client to avoid build-time env var errors
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) {
      supabaseRef.current = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
    }
    return supabaseRef.current;
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function handleTokens() {
      // Parse hash fragment for access_token and refresh_token
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        // Set the session from the URL hash tokens
        const { error: sessionError } = await getSupabase().auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          console.error("Failed to set session:", sessionError.message);
          setLinkExpired(true);
          return;
        }

        // Clear the hash from the URL for cleanliness
        window.history.replaceState(null, "", "/reset-password");
        setSessionReady(true);
        return;
      }

      // No hash tokens — check if we already have a session (e.g. from callback)
      const { data: { session } } = await getSupabase().auth.getSession();
      if (session) {
        setSessionReady(true);
        return;
      }

      // No session and no tokens — link is invalid/expired
      setLinkExpired(true);
    }

    handleTokens();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setPending(true);
    const { error: updateError } = await getSupabase().auth.updateUser({
      password,
    });
    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Sign out so the user logs in fresh with their new password
    await getSupabase().auth.signOut();
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              Password Updated
            </CardTitle>
            <CardDescription>
              Your password has been set successfully. You can now sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => (window.location.href = "/login")}
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Set Your Password</CardTitle>
          <CardDescription>
            {sessionReady
              ? "Choose a password for your account."
              : linkExpired
                ? "This invite link has expired or is invalid."
                : "Verifying your invite link\u2026"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessionReady ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Confirm your password"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Setting password\u2026" : "Set Password"}
              </Button>
            </form>
          ) : linkExpired ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Please ask your admin to generate a new invite link.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => (window.location.href = "/login")}
              >
                Back to Login
              </Button>
            </div>
          ) : (
            <p className="text-sm text-center text-muted-foreground">
              Please wait while we verify your link&hellip;
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
