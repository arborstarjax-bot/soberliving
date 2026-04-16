"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markIntakeComplete } from "./actions";

export function MarkCompleteButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(`Mark intake as complete for ${userName}? This will skip the resident signature step.`)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await markIntakeComplete(userId);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs"
      >
        {isPending ? "Completing…" : "Mark Complete"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
