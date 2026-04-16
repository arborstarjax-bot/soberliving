"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import {
  approveCoverRequest,
  denyCoverRequest,
  approveManagerRequest,
  denyManagerRequest,
  approveAdminRequest,
  denyAdminRequest,
} from "@/app/(dashboard)/leave-requests/actions";
import { markNotificationRead } from "./actions";

export type ApprovalStage = "cover" | "manager" | "admin";

interface Props {
  stage: ApprovalStage;
  leaveRequestId: string;
  notificationId: string;
}

// Copy + server actions per stage. Kept in a table so we don't duplicate
// the whole component three times — the UX is identical at every stage.
const STAGE_CONFIG: Record<
  ApprovalStage,
  {
    approveLabel: string;
    successText: string;
    approve: (id: string) => Promise<{ error?: string }>;
    deny: (id: string, note?: string) => Promise<{ error?: string }>;
  }
> = {
  cover: {
    approveLabel: "Accept Cover",
    successText: "Cover accepted — forwarded to your house manager.",
    approve: approveCoverRequest,
    deny: denyCoverRequest,
  },
  manager: {
    approveLabel: "Approve",
    successText: "Approved — forwarded to admin for final review.",
    approve: approveManagerRequest,
    deny: denyManagerRequest,
  },
  admin: {
    // Admin's approve is the terminal step. Even if the manager hasn't
    // reviewed yet, the server action short-circuits and flips straight
    // to `approved` (admin trumps manager).
    approveLabel: "Approve",
    successText: "Leave request approved.",
    approve: approveAdminRequest,
    deny: denyAdminRequest,
  },
};

/**
 * Inline Approve / Deny controls rendered directly inside a leave-request
 * notification. Saves the reviewer from navigating to /leave-requests.
 * Each stage wires the matching pair of server actions.
 */
export function CoverRequestActions({
  stage,
  leaveRequestId,
  notificationId,
}: Props) {
  const cfg = STAGE_CONFIG[stage];
  const [isPending, startTransition] = useTransition();
  const [showDenyInput, setShowDenyInput] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<"approved" | "denied" | null>(null);

  if (resolved) {
    return (
      <p className="text-xs text-muted-foreground mt-2">
        {resolved === "approved" ? cfg.successText : "Request denied."}
      </p>
    );
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await cfg.approve(leaveRequestId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // Mark-read so the +N sidebar counter updates right away and
      // the reviewer doesn't have to click twice.
      await markNotificationRead(notificationId);
      setResolved("approved");
    });
  }

  function handleDeny() {
    setError(null);
    startTransition(async () => {
      const result = await cfg.deny(leaveRequestId, denyReason || undefined);
      if (result?.error) {
        setError(result.error);
        return;
      }
      await markNotificationRead(notificationId);
      setResolved("denied");
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
            {isPending ? "…" : "Deny"}
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
            onClick={handleApprove}
          >
            <Check className="mr-1 h-3 w-3" /> {cfg.approveLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={isPending}
            onClick={() => setShowDenyInput(true)}
          >
            <X className="mr-1 h-3 w-3" /> Deny
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
