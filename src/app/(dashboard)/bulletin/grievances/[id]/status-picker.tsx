"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateGrievanceStatus } from "../actions";
import type { GrievanceStatus } from "@/lib/types";

const OPTIONS: Array<{ value: GrievanceStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

export function StatusPicker({
  grievanceId,
  initialStatus,
}: {
  grievanceId: string;
  initialStatus: GrievanceStatus;
}) {
  const [status, setStatus] = useState<GrievanceStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: GrievanceStatus) {
    if (next === status) return;
    setError(null);
    const prev = status;
    setStatus(next);
    startTransition(async () => {
      const result = await updateGrievanceStatus(grievanceId, next);
      if (result.error) {
        setStatus(prev);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => change(e.target.value as GrievanceStatus)}
          disabled={isPending}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          {OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
