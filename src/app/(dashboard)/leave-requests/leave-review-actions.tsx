"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, X, RotateCcw } from "lucide-react";
import {
  approveCoverRequest,
  denyCoverRequest,
  approveManagerRequest,
  denyManagerRequest,
  approveAdminRequest,
  denyAdminRequest,
  markLeaveReturned,
} from "./actions";

interface Props {
  requestId: string;
  status: string;
  userRole: string;
  userId: string;
  coveringResidentUserId?: string | null;
}

export function LeaveReviewActions({
  requestId,
  status,
  userRole,
  userId,
  coveringResidentUserId,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [showDenyNote, setShowDenyNote] = useState(false);
  const [denyNote, setDenyNote] = useState("");

  const handleDeny = (denyFn: (id: string, note?: string) => Promise<{ error?: string }>) => {
    startTransition(async () => {
      await denyFn(requestId, denyNote || undefined);
      setShowDenyNote(false);
      setDenyNote("");
    });
  };

  // Covering resident can approve/deny at pending_cover stage
  if (status === "pending_cover") {
    const canAct = userId === coveringResidentUserId || userRole === "admin";
    if (!canAct) return <Badge variant="secondary" className="text-xs">Awaiting Cover Approval</Badge>;

    if (showDenyNote) {
      return (
        <div className="flex items-center gap-2">
          <Input
            value={denyNote}
            onChange={(e) => setDenyNote(e.target.value)}
            placeholder="Reason (optional)"
            className="h-8 text-xs w-40"
          />
          <Button
            size="sm"
            variant="destructive"
            className="h-8"
            disabled={isPending}
            onClick={() => handleDeny(denyCoverRequest)}
          >
            {isPending ? "…" : "Deny"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => setShowDenyNote(false)}
          >
            Cancel
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-8"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await approveCoverRequest(requestId);
            })
          }
        >
          <Check className="mr-1 h-3 w-3" /> Approve Cover
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={isPending}
          onClick={() => setShowDenyNote(true)}
        >
          <X className="mr-1 h-3 w-3" /> Deny
        </Button>
      </div>
    );
  }

  // House managers can approve/deny at pending_manager stage
  if (status === "pending_manager") {
    const canAct = userRole === "admin" || userRole === "manager";
    if (!canAct) return <Badge variant="secondary" className="text-xs">Awaiting Manager Approval</Badge>;

    if (showDenyNote) {
      return (
        <div className="flex items-center gap-2">
          <Input
            value={denyNote}
            onChange={(e) => setDenyNote(e.target.value)}
            placeholder="Reason (optional)"
            className="h-8 text-xs w-40"
          />
          <Button
            size="sm"
            variant="destructive"
            className="h-8"
            disabled={isPending}
            onClick={() => handleDeny(denyManagerRequest)}
          >
            {isPending ? "…" : "Deny"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => setShowDenyNote(false)}
          >
            Cancel
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-8"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await approveManagerRequest(requestId);
            })
          }
        >
          <Check className="mr-1 h-3 w-3" /> Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={isPending}
          onClick={() => setShowDenyNote(true)}
        >
          <X className="mr-1 h-3 w-3" /> Deny
        </Button>
      </div>
    );
  }

  // Admin final approval at pending_admin stage
  if (status === "pending_admin") {
    const canAct = userRole === "admin" || userRole === "manager";
    if (!canAct) return <Badge variant="secondary" className="text-xs">Awaiting Admin Approval</Badge>;

    if (showDenyNote) {
      return (
        <div className="flex items-center gap-2">
          <Input
            value={denyNote}
            onChange={(e) => setDenyNote(e.target.value)}
            placeholder="Reason (optional)"
            className="h-8 text-xs w-40"
          />
          <Button
            size="sm"
            variant="destructive"
            className="h-8"
            disabled={isPending}
            onClick={() => handleDeny(denyAdminRequest)}
          >
            {isPending ? "…" : "Deny"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => setShowDenyNote(false)}
          >
            Cancel
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-8"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await approveAdminRequest(requestId);
            })
          }
        >
          <Check className="mr-1 h-3 w-3" /> Final Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={isPending}
          onClick={() => setShowDenyNote(true)}
        >
          <X className="mr-1 h-3 w-3" /> Deny
        </Button>
      </div>
    );
  }

  // Mark returned for approved requests
  if (status === "approved" && (userRole === "admin" || userRole === "manager")) {
    return (
      <Button
        size="sm"
        variant="secondary"
        className="h-8"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await markLeaveReturned(requestId);
          })
        }
      >
        <RotateCcw className="mr-1 h-3 w-3" /> Mark Returned
      </Button>
    );
  }

  return null;
}
