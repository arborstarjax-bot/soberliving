import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/pagination";
import type { PaginationMeta } from "@/lib/pagination";
import { ACTIVITY_CATEGORIES } from "./categories";

interface ActivityLogEntry {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
  house: { name: string } | null;
  actor: { full_name: string } | null;
}

// Event-type → accent color used for the timeline bullet. Unknown types
// fall back to a neutral gray so the bullet still renders.
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

// Build a tab href that selects `tab` and resets `page=1`, preserving any
// other query params the page might accept in the future.
function buildTabHref(
  tab: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "tab" || key === "page") continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  if (tab !== "All") params.set("tab", tab);
  const qs = params.toString();
  return qs ? `/activity?${qs}` : "/activity";
}

interface ActivityViewProps {
  logs: ActivityLogEntry[];
  activeTab: string;
  meta: PaginationMeta;
  searchParams: Record<string, string | string[] | undefined>;
}

export function ActivityView({
  logs,
  activeTab,
  meta,
  searchParams,
}: ActivityViewProps) {
  return (
    <div className="space-y-4">
      {/* URL-driven tab strip. Clicking a tab navigates to `?tab=X&page=1`
          so the server re-runs its query with the right filter. Keeps
          pagination state consistent across tab switches. */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
        {ACTIVITY_CATEGORIES.map((cat) => {
          const isActive = cat === activeTab;
          return (
            <Link
              key={cat}
              href={buildTabHref(cat, searchParams)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              )}
            >
              {cat}
            </Link>
          );
        })}
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              {activeTab === "All"
                ? "No activity yet"
                : `No activity in ${activeTab}`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {logs.map((log) => (
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
                        <span>{new Date(log.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</span>
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
            <Pagination
              meta={meta}
              basePath="/activity"
              searchParams={searchParams}
              itemLabel="entries"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
