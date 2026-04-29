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
  const workspaceCode = searchParams.get("workspace");
  const [state, action, pending] = useActionState(signup, undefined);

  const isJoin = !!workspaceCode;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            {isJoin ? "Join Workspace" : "Create Your Workspace"}
          </CardTitle>
          <CardDescription>
            {isJoin
              ? "Create an account to request access to this workspace."
              : "Sign up and set up your workspace. You\u2019ll be the admin."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state?.success ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
              {state.success}
            </p>
          ) : (
            <form action={action} className="space-y-4">
              {workspaceCode && (
                <input type="hidden" name="workspace_code" value={workspaceCode} />
              )}

              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Doe"
                  required
                />
              </div>

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

              {!isJoin && (
                <div className="space-y-2">
                  <Label htmlFor="workspace_name">Workspace Name</Label>
                  <Input
                    id="workspace_name"
                    name="workspace_name"
                    type="text"
                    placeholder="e.g. Sunrise Recovery"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    The name of your organization.
                  </p>
                </div>
              )}

              {state?.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending
                  ? "Creating account..."
                  : isJoin
                    ? "Request to Join"
                    : "Create Workspace"}
              </Button>
            </form>
          )}
        </CardContent>
        {!isJoin && (
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
          </CardFooter>
        )}
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
