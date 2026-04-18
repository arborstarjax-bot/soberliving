"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { cleanupBackfilledAutoDemerits } from "./actions";

export function CleanupBackfilledDemeritsButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function onClick() {
    if (
      !confirm(
        "Delete all auto-demerits whose linked signoff was created AFTER its date? This removes demerits that were issued by the old back-fill bug."
      )
    )
      return;
    setResult(null);
    startTransition(async () => {
      const r = await cleanupBackfilledAutoDemerits();
      if ("error" in r && r.error) setResult(`Error: ${r.error}`);
      else if ("count" in r) setResult(`Removed ${r.count} auto-demerit(s).`);
      setTimeout(() => setResult(null), 6000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className="text-xs text-muted-foreground">{result}</span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        disabled={pending}
        title="Delete demerits whose signoff was back-filled (mid-cycle reassign bug)"
      >
        {pending ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="mr-1 h-3.5 w-3.5" />
        )}
        Clean up back-filled demerits
      </Button>
    </div>
  );
}
