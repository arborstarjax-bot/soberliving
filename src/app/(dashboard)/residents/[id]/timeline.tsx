"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ActivityLog } from "@/lib/types";

interface Props {
  activity: ActivityLog[];
}

// Timeline paginates in pages of 20 so residents with years of
// history don't render a 500-item list (the rest of the app uses the
// same paging size — keep it in sync).
const PAGE_SIZE = 20;

export function ResidentTimeline({ activity }: Props) {
  const [page, setPage] = useState(0);

  if (activity.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No activity yet
      </p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(activity.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const start = clampedPage * PAGE_SIZE;
  const slice = activity.slice(start, start + PAGE_SIZE);
  const showPager = activity.length > PAGE_SIZE;

  return (
    <div className="space-y-3">
      <div className="relative space-y-0">
        <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
        {slice.map((entry) => (
          <div key={entry.id} className="relative flex gap-4 py-3 pl-10">
            <div
              className={`absolute left-3 top-4 h-2.5 w-2.5 rounded-full border-2 border-background ${getEventColor(entry.event_type)}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm">{entry.description}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {showPager && (
        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Showing {start + 1}–{Math.min(start + PAGE_SIZE, activity.length)}{" "}
            of {activity.length}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              className="h-8 gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground px-1">
              {clampedPage + 1} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={clampedPage >= totalPages - 1}
              className="h-8 gap-1"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case "move_in":
      return "bg-green-500";
    case "move_out":
      return "bg-red-500";
    case "bed_assigned":
    case "bed_vacated":
      return "bg-blue-500";
    case "chore_assigned":
    case "chore_completed":
    case "chore_approved":
      return "bg-emerald-500";
    case "chore_rejected":
    case "chore_missed":
      return "bg-orange-500";
    case "incident_logged":
      return "bg-red-500";
    case "leave_requested":
    case "leave_approved":
    case "leave_returned":
      return "bg-purple-500";
    case "leave_denied":
      return "bg-red-500";
    case "note_added":
      return "bg-gray-400";
    default:
      return "bg-gray-300";
  }
}
