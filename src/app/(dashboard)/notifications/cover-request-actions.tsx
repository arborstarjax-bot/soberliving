"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import {
  approveCoverRequest,
  denyCoverRequest,
} from "@/app/(dashboard)/leave-requests/actions";
import { markNotificationRead } from "./actions";

interface Props {
  leaveRequestId: string;
  notificationId: string;
}

/**
 * Inline Accept / Decline controls for a `cover_request` notification.
 * Wraps the existing leave-request server actions so the resident can
 * respond without navigating to /leave-requests. Marks the notification
 * read on success so it stops nagging.
 */
export function CoverRequestActions({ leaveRequestId, notificationId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showDenyInput, setShowDenyInput] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<"accepted" | "declined" | null>(
    null
  );

  if (resolved) {
    return (
      <p className="text-xs text-muted-foreground">
        {resolved === "accepted"
          ? "Cover accepted — forwarded to your house manager."
          : "Cover declined."}
      </p>
    );
  }

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await approveCoverRequest(leaveRequestId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // The card's Mark-read button does the same thing, but we do it
      // here so the +N sidebar counter ticks down the moment the user
      // clicks Accept instead of waiting for a second interaction.
      await markNotificationRead(notificationId);
      setResolved("accepted");
    });
  }

  function handleDeny() {
    setError(null);
    startTransition(async () => {
      const result = await denyCoverRequest(
        leaveRequestId,
        denyReason || undefined
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      await markNotificationRead(notificationId);
      setResolved("declined");
    });
  }

  return (
    <div className="mt-2 space-y-2">
      {showDenyInput ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
            placeholder="Reason (optional)"
            className="h-8 flex-1 min-w-40 rounded-md border border-input bg-background px-2 text-xs"
          />
          <Button
            size="sm"
            variant="destructive"
            className="h-8"
            disabled={isPending}
            onClick={handleDeny}
          >
            {isPending ? "…" : "Decline"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => {
              setShowDenyInput(false);
              setDenyReason("");
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            className="h-8"
            disabled={isPending}
            onClick={handleAccept}
          >
            <Check className="mr-1 h-3 w-3" /> Accept Cover
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={isPending}
            onClick={() => setShowDenyInput(true)}
          >
            <X className="mr-1 h-3 w-3" /> Decline
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
