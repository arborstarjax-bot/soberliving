import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "./sign-out-button";

/**
 * Standalone page shown to users whose `account_status === 'rejected'`.
 * Lives outside the `(dashboard)` group so it can render without the
 * usual session gating — `getSessionUser()` intentionally returns null
 * for non-active accounts, which would otherwise bounce these users
 * back to /login in a loop.
 */
export default async function ApplicationDeniedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, account_status, denial_reason, denied_at")
    .eq("id", user.id)
    .single();

  // If they're no longer rejected (admin reopened them), route them back
  // to the dashboard so they can pick up where they left off.
  if (!profile || profile.account_status !== "rejected") {
    redirect("/dashboard");
  }

  const p = profile as {
    full_name: string;
    denial_reason: string | null;
    denied_at: string | null;
  };

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Application Not Approved</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Hi {p.full_name}, your application to move into the house was
            not approved by staff.
          </p>
          <div className="rounded-md border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Reason from staff
            </p>
            <p className="text-sm">
              {p.denial_reason?.trim() ||
                "No specific reason was recorded. Please contact a staff member."}
            </p>
            {p.denied_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Decision recorded{" "}
                {new Date(p.denied_at).toLocaleDateString()}.
              </p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            If you believe this was in error or would like to reapply,
            please reach out to a staff member directly. Staff can reopen
            your application at any time.
          </p>
          <div className="flex items-center justify-between pt-2">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:underline"
            >
              Return to login
            </Link>
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
