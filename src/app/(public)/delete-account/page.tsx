import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Delete Your Account — HouseFlow",
};

// Public deletion-request page (App Store metadata links here). It explains
// both deletion paths; logged-in users delete directly in the app.
export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 py-12">
      <h1 className="text-3xl font-bold">Delete Your Account</h1>
      <p className="text-muted-foreground">
        HouseFlow accounts are managed inside the app. Deletion is permanent
        and removes your login plus personal details.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>If you can sign in</CardTitle>
          <CardDescription>Fastest option — takes a minute.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <Link href="/login" className="underline">
                Sign in
              </Link>
            </li>
            <li>Open Settings</li>
            <li>Select &quot;Delete my account&quot; and confirm</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>If you&apos;re a workspace admin</CardTitle>
          <CardDescription>
            To delete the entire workspace and all member accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Sign in and open Workspace Settings</li>
            <li>Go to the General tab</li>
            <li>Choose &quot;Delete workspace&quot; and type the workspace name to confirm</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>If you can&apos;t sign in</CardTitle>
          <CardDescription>
            Ask your workspace administrator to remove you, or contact the
            platform operator. House records your workspace is required to
            keep are anonymized rather than erased.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
