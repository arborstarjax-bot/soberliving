import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "../application-denied/sign-out-button";

/**
 * Standalone lockout page for residents whose house residency is
 * no longer active (discharged, moved out, etc.). Lives outside
 * the `(dashboard)` group so no sidebar / dashboard chrome
 * renders — the user literally cannot navigate anywhere in the
 * app. Their login + documents survive for potential return;
 * once staff reactivates them the layout-level gate clears and
 * they're bounced back to /dashboard automatically.
 */
export default async function DischargedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, account_status")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const p = profile as {
    full_name: string;
    account_status: string | null;
  };

  // If the underlying account was flipped to rejected/suspended,
  // defer to the existing denied page. Otherwise check the
  // residents table — if ANY row is active they're no longer
  // discharged and should be let back into the app.
  if (p.account_status === "rejected") redirect("/application-denied");

  const admin = createAdminClient();
  const { data: residentRows } = await admin
    .from("residents")
    .select("status")
    .eq("user_id", user.id);

  const hasActive = (residentRows ?? []).some((r) => r.status === "active");
  if (hasActive) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>No Resident Profile Found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Hi {p.full_name}, your resident profile is no longer active.
            Please contact your house manager if you believe this is a
            mistake or would like to return to the house.
          </p>
          <p className="text-sm text-muted-foreground">
            Your account, documents, and sign-in credentials are
            preserved — staff can reactivate you at any time.
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
