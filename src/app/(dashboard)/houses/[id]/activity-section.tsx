import { createClient } from "@/lib/supabase/server";

/**
 * Activity tab body — 20 most recent activity_log rows for this
 * house. Only mounted when `tab=activity`.
 */
export async function ActivitySection({ houseId }: { houseId: string }) {
  const supabase = await createClient();
  const { data: activity } = await supabase
    .from("activity_log")
    .select("*")
    .eq("house_id", houseId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!activity || activity.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No activity yet
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {activity.map((entry) => (
        <div
          key={entry.id as string}
          className="flex items-start gap-3 text-sm border-b pb-3 last:border-0"
        >
          <div className="flex-1">
            <p>{entry.description as string}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(entry.created_at as string).toLocaleString("en-US", {
                timeZone: "America/New_York",
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
