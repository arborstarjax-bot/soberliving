"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Scanner-safe landing page for password-recovery emails.
 *
 * Supabase recovery links are one-time-use: anything that GETs the
 * verify URL consumes the token. Mail apps (Gmail, iOS Mail, corporate
 * safe-link scanners) prefetch links in incoming mail, which burns the
 * token before the user ever clicks — they land on "link expired".
 *
 * The fix is to point the email template at this page with
 * `?token_hash=...&type=recovery` instead of the default
 * `{{ .ConfirmationURL }}`. Prefetching this page only renders a
 * button; the token is verified (consumed) only when a real user
 * clicks, then they are forwarded to /reset-password with a live
 * session. Requires the Recovery template link to be:
 *   {{ .SiteURL }}/reset-password/confirm?token_hash={{ .TokenHash }}&type=recovery
 */
export default function ResetPasswordConfirmPage() {
  const [{ tokenHash, valid }] = useState(() => {
    if (typeof window === "undefined") {
      return { tokenHash: null, valid: false };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      tokenHash: params.get("token_hash"),
      valid: !!params.get("token_hash") && params.get("type") === "recovery",
    };
  });
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleConfirm() {
    if (!tokenHash) return;
    setPending(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    setPending(false);
    if (error) {
      setFailed(true);
      return;
    }
    window.location.href = "/reset-password";
  }

  const expired = failed || valid === false;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
          <CardDescription>
            {expired
              ? "This link has expired or is invalid."
              : "Tap below to continue resetting your password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expired ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Request a new link and try again.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => (window.location.href = "/forgot-password")}
              >
                Request a new link
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => (window.location.href = "/login")}
              >
                Back to Login
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              disabled={pending || valid !== true}
              onClick={handleConfirm}
            >
              {pending ? "Verifying\u2026" : "Continue"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
