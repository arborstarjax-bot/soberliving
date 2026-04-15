"use client";

import { useTransition, useState } from "react";
import { liftRestriction } from "./actions";
import { Button } from "@/components/ui/button";

export function LiftRestrictionButton({ restrictionId }: { restrictionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await liftRestriction(restrictionId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Lifting..." : "Lift"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
