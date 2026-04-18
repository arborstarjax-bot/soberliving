"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { reviewSignoff } from "@/app/(dashboard)/chores/actions";
import { markNotificationRead } from "./actions";

interface Props {
  signoffId: string;
  notificationId: string;
  // Current status of the underlying chore_signoff, loaded server-side
  // so that once a decision has been made elsewhere (calendar, another
  // manager) the notification row no longer exposes stale Approve/Deny
  // buttons — instead it shows the lifecycle line.
  currentStatus?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
  rejectionNote?: string | null;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Inline Approve / Reject controls rendered directly inside a
 * chore_submitted notification. Calls the same `reviewSignoff` server
 * action the chore calendar uses — we don't touch calendar code. Once
 * the signoff has been decided (here or elsewhere), the controls swap
 * to a read-only lifecycle line.
 */
export function ChoreSignoffActions({
  signoffId,
  notificationId,
  currentStatus,
  reviewerName,
  reviewedAt,
  rejectionNote,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [showDenyInput, setShowDenyInput] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{
    kind: "approved" | "rejected";
    note?: string;
  } | null>(null);

  // Pessimistic read from the DB wins over local state — if another
  // reviewer acted on the calendar first, this matches their outcome
  // instead of showing an optimistic "Approved" label under the wrong
  // reviewer's name.
  const effectiveStatus = currentStatus ?? null;
  const isSettled =
    effectiveStatus === "approved" || effectiveStatus === "rejected";

  if (isSettled || resolved) {
    const kind = resolved?.kind ?? (effectiveStatus as "approved" | "rejected");
    const tone =
      kind === "approved"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400"
        : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400";
    const label = kind === "approved" ? "Approved" : "Rejected";
    const who = reviewerName ? ` by ${reviewerName}` : "";
    const when = reviewedAt ? ` · ${formatDateTime(reviewedAt)}` : "";
    const note = resolved?.note ?? rejectionNote;
    return (
      <div className="mt-2 space-y-1">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tone}`}
        >
          {label}
          {who}
          {when}
        </span>
        {kind === "rejected" && note && (
          <p className="text-xs text-muted-foreground">Reason: {note}</p>
        )}
      </div>
    );
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await reviewSignoff(signoffId, "approve");
      if (result?.error) {
        setError(result.error);
        return;
      }
      await markNotificationRead(notificationId);
      setResolved({ kind: "approved" });
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await reviewSignoff(
        signoffId,
        "reject",
        denyReason || undefined
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      await markNotificationRead(notificationId);
      setResolved({ kind: "rejected", note: denyReason || undefined });
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
            onClick={handleReject}
          >
            {isPending ? "…" : "Reject"}
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
            <Check className="mr-1 h-3 w-3" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={isPending}
            onClick={() => setShowDenyInput(true)}
          >
            <X className="mr-1 h-3 w-3" /> Reject
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
