"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Self-serve password reset request page. Sends a Supabase password
 * recovery email; the link in that email lands the user on
 * /reset-password with tokens in the URL fragment, which is the same
 * flow the admin-invite path uses.
 *
 * Kept deliberately simple: one email field, no role gating — we only
 * call Supabase's public recovery endpoint, which silently succeeds on
 * unknown emails so we don't leak account existence.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError("Enter your email");
      return;
    }

    setPending(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSent(true);
    } catch (err) {
      // Catch unexpected throws (missing env vars at runtime,
      // network errors, etc.) so the user sees something instead
      // of a silently-reset form.
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
            <CardDescription>
              If an account exists for <strong>{email}</strong>, a password
              reset link is on its way. The link expires in 1 hour.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link
              href="/login"
              className="text-sm font-medium text-primary hover:underline"
            >
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Reset password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a link to set a new
            password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link
            href="/login"
            className="ml-1 font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
