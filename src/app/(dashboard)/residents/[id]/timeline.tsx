"use client";

import type { ActivityLog } from "@/lib/types";

interface Props {
  activity: ActivityLog[];
}

export function ResidentTimeline({ activity }: Props) {
  if (activity.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No activity yet
      </p>
    );
  }

  return (
    <div className="relative space-y-0">
      <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
      {activity.map((entry) => (
        <div key={entry.id} className="relative flex gap-4 py-3 pl-10">
          <div
            className={`absolute left-3 top-4 h-2.5 w-2.5 rounded-full border-2 border-background ${getEventColor(entry.event_type)}`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm">{entry.description}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(entry.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
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
