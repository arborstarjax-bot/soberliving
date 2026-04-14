"use client";

import { useTransition, useState } from "react";
import { reviewLeaveRequest, markLeaveReturned } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, RotateCcw } from "lucide-react";

interface Props {
  requestId: string;
  status: string;
}

export function LeaveReviewActions({ requestId, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showDeny, setShowDeny] = useState(false);
  const [denialNote, setDenialNote] = useState("");

  if (status === "approved") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(() => { markLeaveReturned(requestId); })
        }
      >
        <RotateCcw className="mr-1 h-3 w-3" />
        {isPending ? "Saving…" : "Mark Returned"}
      </Button>
    );
  }

  if (status !== "pending") return null;

  return (
    <div className="flex items-center gap-2">
      {showDeny ? (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Reason..."
            value={denialNote}
            onChange={(e) => setDenialNote(e.target.value)}
            className="w-40 h-8"
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                reviewLeaveRequest(requestId, "deny", denialNote);
              })
            }
          >
            Deny
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDeny(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <Button
            size="sm"
            variant="default"
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                reviewLeaveRequest(requestId, "approve");
              })
            }
          >
            <Check className="mr-1 h-3 w-3" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => setShowDeny(true)}
          >
            <X className="mr-1 h-3 w-3" />
            Deny
          </Button>
        </>
      )}
    </div>
  );
}
