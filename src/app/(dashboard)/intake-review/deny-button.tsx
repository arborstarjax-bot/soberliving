"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { denyIntakeApplication } from "./actions";

export function DenyButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const reason = prompt(
      `Deny ${userName}'s intake application?\n\nOptional reason (will be recorded in activity log):`,
      ""
    );
    // null = user hit Cancel; empty string = user hit OK without typing,
    // which we treat as a confirmed denial with no recorded reason.
    if (reason === null) return;

    setError(null);
    startTransition(async () => {
      const result = await denyIntakeApplication(userId, reason || undefined);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Denying…" : "Deny"}
      </Button>
      {error && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </>
  );
}
