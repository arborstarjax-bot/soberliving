"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

interface ActivityLogEntry {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
  house: { name: string } | null;
  actor: { full_name: string } | null;
}

// Map each activity event_type to a user-facing category label.
// Anything not listed falls into "Other" so nothing is hidden.
const EVENT_TO_CATEGORY: Record<string, string> = {
  move_in: "Residents",
  move_out: "Residents",
  bed_assigned: "Residents",
  bed_vacated: "Residents",
  user_created: "Residents",
  role_changed: "Residents",
  resident_deleted: "Residents",
  resident_discharged: "Residents",
  chore_created: "Chores",
  chore_assigned: "Chores",
  chore_completed: "Chores",
  chore_approved: "Chores",
  chore_rejected: "Chores",
  chore_overridden: "Chores",
  chore_unassigned: "Chores",
  chore_rotated: "Chores",
  rotation_created: "Chores",
  incident_logged: "Incidents",
  demerit_issued: "Discipline",
  demerit_edited: "Discipline",
  demerit_deleted: "Discipline",
  demerit_worked_off: "Discipline",
  restriction_added: "Discipline",
  restriction_lifted: "Discipline",
  restriction_deleted: "Discipline",
  leave_requested: "Leave",
  leave_approved: "Leave",
  leave_denied: "Leave",
  leave_returned: "Leave",
  note_added: "Notes",
  intake_review_completed: "Intake",
  intake_marked_complete: "Intake",
  check_in_sent: "Check-Ins",
  check_in_submitted: "Check-Ins",
  house_created: "Houses",
  house_updated: "Houses",
  house_deleted: "Houses",
  room_created: "Houses",
  room_updated: "Houses",
  room_deleted: "Houses",
  bed_created: "Houses",
  bed_updated: "Houses",
  bed_deleted: "Houses",
};

function getCategory(eventType: string): string {
  return EVENT_TO_CATEGORY[eventType] ?? "Other";
}

const eventColor: Record<string, string> = {
  move_in: "bg-green-500",
  move_out: "bg-gray-500",
  bed_assigned: "bg-blue-500",
  bed_vacated: "bg-blue-300",
  chore_created: "bg-indigo-400",
  chore_assigned: "bg-indigo-500",
  chore_completed: "bg-emerald-400",
  chore_approved: "bg-emerald-500",
  chore_rejected: "bg-red-400",
  incident_logged: "bg-red-500",
  leave_requested: "bg-yellow-500",
  leave_approved: "bg-green-400",
  leave_denied: "bg-red-400",
  leave_returned: "bg-green-500",
  note_added: "bg-purple-400",
  user_created: "bg-blue-400",
  role_changed: "bg-orange-400",
  rotation_created: "bg-indigo-400",
};

export function ActivityTabs({ logs }: { logs: ActivityLogEntry[] }) {
  const [activeTab, setActiveTab] = useState<string>("all");

  // Build category buckets dynamically from the data — a tab only appears
  // when there's at least one log entry in that category.
  const { buckets, categories } = useMemo(() => {
    const buckets = new Map<string, ActivityLogEntry[]>();
    for (const l of logs) {
      const cat = getCategory(l.event_type);
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(l);
    }
    const categories = Array.from(buckets.keys()).sort();
    return { buckets, categories };
  }, [logs]);

  const visible = activeTab === "all" ? logs : buckets.get(activeTab) ?? [];

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No activity yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v ?? "all")}>
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="all">
          All
          <span className="ml-1 text-[10px] text-muted-foreground">
            {logs.length}
          </span>
        </TabsTrigger>
        {categories.map((cat) => (
          <TabsTrigger key={cat} value={cat}>
            {cat}
            <span className="ml-1 text-[10px] text-muted-foreground">
              {buckets.get(cat)?.length ?? 0}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value={activeTab} className="mt-4">
        {visible.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No activity in this category
          </p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-4">
              {visible.map((log) => (
                <div
                  key={log.id}
                  className="relative flex items-start gap-4 pl-10"
                >
                  <div
                    className={`absolute left-2.5 top-1.5 h-3 w-3 rounded-full ${
                      eventColor[log.event_type] ?? "bg-gray-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{log.description}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                      {log.house?.name && (
                        <>
                          <span>·</span>
                          <span>{log.house.name}</span>
                        </>
                      )}
                      {log.actor?.full_name && (
                        <>
                          <span>·</span>
                          <span>by {log.actor.full_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-xs capitalize shrink-0"
                  >
                    {log.event_type.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
