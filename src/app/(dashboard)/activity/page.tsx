import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

export default async function ActivityLogPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let query = supabase
    .from("activity_log")
    .select("*, actor:users!actor_id(full_name), house:houses!house_id(name), resident:residents!resident_id(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (houseFilter) {
    query = query.in("house_id", houseFilter);
  }

  const { data: logs } = await query;

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-muted-foreground">
          Recent activity across all houses
        </p>
      </div>

      {(logs ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No activity yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {(logs ?? []).map((log) => (
              <div key={log.id} className="relative flex items-start gap-4 pl-10">
                <div
                  className={`absolute left-2.5 top-1.5 h-3 w-3 rounded-full ${eventColor[log.event_type] ?? "bg-gray-400"}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{log.description}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                    {(log.house as unknown as { name: string } | null)?.name && (
                      <>
                        <span>·</span>
                        <span>
                          {(log.house as unknown as { name: string } | null)?.name}
                        </span>
                      </>
                    )}
                    {(log.actor as unknown as { full_name: string } | null)?.full_name && (
                      <>
                        <span>·</span>
                        <span>
                          by {(log.actor as unknown as { full_name: string } | null)?.full_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs capitalize shrink-0">
                  {log.event_type.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
