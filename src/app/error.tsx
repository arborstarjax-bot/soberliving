"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Root error boundary. Next renders this for any uncaught error thrown
 * during rendering, server actions, or data fetching in the App
 * Router. Without it users see the unbranded framework 500 page.
 *
 * We intentionally keep this component dependency-light (no Supabase
 * client, no layout) so it can't cascade-fail if the error originated
 * from one of those systems.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Forward to any observability you plug in later (Sentry, etc).
    // For now a console.error is enough — Vercel captures it.
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Something went wrong</CardTitle>
          <CardDescription>
            The app hit an unexpected error. Try again in a moment, or head
            back to the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error.digest && (
            <p className="text-center text-xs text-muted-foreground">
              Error ID: <code className="font-mono">{error.digest}</code>
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
          <Link href="/dashboard">
            <Button>Back to dashboard</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
