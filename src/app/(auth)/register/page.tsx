"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signup } from "@/app/(auth)/actions";
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

function RegisterForm() {
  const searchParams = useSearchParams();
  const invite = searchParams.get("invite");
  const [state, action, pending] = useActionState(signup, undefined);

  const isInvite = !!invite;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            {isInvite ? "Accept Invitation" : "Create Your Workspace"}
          </CardTitle>
          <CardDescription>
            {isInvite
              ? "Create an account to join the workspace."
              : "Sign up and set up your sober living workspace. You\u2019ll be the admin."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state?.success ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
              {state.success}
            </p>
          ) : (
            <form action={action} className="space-y-4">
              {invite && (
                <input type="hidden" name="invite_token" value={invite} />
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  At least 8 characters.
                </p>
              </div>

              {!isInvite && (
                <div className="space-y-2">
                  <Label htmlFor="workspace_name">Workspace Name</Label>
                  <Input
                    id="workspace_name"
                    name="workspace_name"
                    type="text"
                    placeholder="e.g. Jax Sober Living"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    The name of your sober living organization.
                  </p>
                </div>
              )}

              {state?.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending
                  ? "Creating account..."
                  : isInvite
                    ? "Join Workspace"
                    : "Create Workspace"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <div>
            Already have an account?{" "}
            <Link
              href="/login"
              className="ml-1 font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </div>
          {!isInvite && (
            <div>
              Have an invite link?{" "}
              <Link
                href="/login"
                className="ml-1 font-medium text-primary hover:underline"
              >
                Sign in to accept it
              </Link>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
