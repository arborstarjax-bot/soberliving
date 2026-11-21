"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { resendPendingCommitmentNotification } from "./actions";

export function ResendCommitmentButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await resendPendingCommitmentNotification(userId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSent(true);
      // Clear the "Sent" label after a short delay so the button
      // becomes clickable again without a full page refresh.
      setTimeout(() => setSent(false), 2500);
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={isPending || sent}
        className="h-8 gap-1.5 text-xs"
        aria-label={`Resend commitment signature request to ${userName}`}
      >
        <Send className="h-3.5 w-3.5" />
        {isPending ? "Sending…" : sent ? "Sent" : "Resend"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
