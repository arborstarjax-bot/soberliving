import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { ActivityTabs } from "./activity-tabs";

interface ActivityLogRow {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
  actor: { full_name: string } | { full_name: string }[] | null;
  house: { name: string } | { name: string }[] | null;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function ActivityLogPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let query = supabase
    .from("activity_log")
    .select(
      "id, event_type, description, created_at, actor:users!actor_id(full_name), house:houses!house_id(name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (houseFilter) {
    query = query.in("house_id", houseFilter);
  }

  const { data: logs } = await query;

  const normalized = ((logs ?? []) as ActivityLogRow[]).map((l) => ({
    id: l.id,
    event_type: l.event_type,
    description: l.description,
    created_at: l.created_at,
    actor: firstOrNull(l.actor),
    house: firstOrNull(l.house),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-muted-foreground">
          Recent activity across all houses
        </p>
      </div>
      <ActivityTabs logs={normalized} />
    </div>
  );
}
