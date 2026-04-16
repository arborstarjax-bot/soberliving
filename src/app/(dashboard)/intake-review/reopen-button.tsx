"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reopenIntakeApplication } from "./actions";

/**
 * Admin-only button for the Denied tab that restores an application to
 * Pending. Confirmation is lightweight (native confirm) because the
 * action itself is reversible (admin can re-deny from Pending).
 */
export function ReopenButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const ok = confirm(
      `Reopen ${userName}'s application?\n\nTheir application will return to Pending and they'll regain access to the app.`
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await reopenIntakeApplication(userId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Reopening…" : "Reopen"}
      </Button>
    </div>
  );
}
