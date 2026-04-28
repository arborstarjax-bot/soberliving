import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function signOutAction() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function PendingApprovalPage() {
  const user = await requireAuth();

  // If already approved, send them to dashboard
  if (user.workspace_member_status === "active") {
    redirect("/dashboard");
  }

  // If denied, send to login
  if (user.workspace_member_status === "denied") {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Application Submitted</CardTitle>
          <CardDescription>
            Your registration has been submitted successfully.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            A workspace administrator will review your application and approve
            your account. You&apos;ll be able to access the app once approved.
          </p>
          <form action={signOutAction}>
            <Button variant="outline" type="submit" className="w-full">
              Sign Out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
