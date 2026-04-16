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
  // Current status of the underlying leave_request, queried server-side
  // when the Notifications page loads. Used to decide whether this
  // stage's Approve/Deny controls are still actionable or should be
  // replaced with a resolved-state badge so old notifications don't
  // expose stale actions after the request has moved on.
  currentStatus?: string;
  rejectionStep?: string | null;
}

// Each stage is only actionable while the underlying request is in its
// matching pending state. Admin is additionally allowed to act on a
// request still in pending_manager (admin-trumps-manager short-circuit
// lives in the server action).
function isStageActionable(
  stage: ApprovalStage,
  status: string | undefined
): boolean {
  if (!status) return true; // unknown — fall back to the old behavior
  if (stage === "cover") return status === "pending_cover";
  if (stage === "manager") return status === "pending_manager";
  return status === "pending_admin" || status === "pending_manager";
}

// Human-readable label that replaces Approve/Deny when the stage is no
// longer actionable. Mirrors the lifecycle of the leave_request.
function resolvedLabel(
  stage: ApprovalStage,
  status: string,
  rejectionStep: string | null
): { label: string; tone: "approved" | "denied" | "neutral" } {
  if (status === "approved") return { label: "Approved", tone: "approved" };
  if (status === "returned") return { label: "Returned", tone: "approved" };
  if (status === "cancelled") return { label: "Cancelled", tone: "neutral" };
  if (status === "rejected") {
    if (rejectionStep === "cover") return { label: "Cover declined", tone: "denied" };
    if (rejectionStep === "manager") return { label: "Denied by manager", tone: "denied" };
    if (rejectionStep === "admin") return { label: "Denied by admin", tone: "denied" };
    return { label: "Denied", tone: "denied" };
  }
  // Still pending, but at a later stage than this notification covers.
  if (stage === "cover" && (status === "pending_manager" || status === "pending_admin")) {
    return { label: "Cover accepted", tone: "approved" };
  }
  if (stage === "manager" && status === "pending_admin") {
    return { label: "Approved by manager", tone: "approved" };
  }
  return { label: status, tone: "neutral" };
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
  currentStatus,
  rejectionStep = null,
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

  // If the underlying leave request has moved past this reviewer's stage
  // (e.g. the admin already approved, or another reviewer denied), show
  // the resolved state instead of stale Approve/Deny buttons. Old
  // notifications stay on the page but accurately reflect the current
  // lifecycle of the request.
  if (currentStatus && !isStageActionable(stage, currentStatus)) {
    const { label, tone } = resolvedLabel(stage, currentStatus, rejectionStep);
    const toneClass =
      tone === "approved"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400"
        : tone === "denied"
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400"
          : "border-border bg-muted text-muted-foreground";
    return (
      <div className="mt-2">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${toneClass}`}
        >
          {label}
        </span>
      </div>
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
