import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { getPageParams, buildPaginationMeta } from "@/lib/pagination";
import { ActivityView } from "./activity-view";
import {
  ACTIVITY_CATEGORIES,
  eventTypesForCategory,
  allMappedEventTypes,
} from "./categories";

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

function normalizeTab(
  raw: string | string[] | undefined
): (typeof ACTIVITY_CATEGORIES)[number] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "All";
  const match = ACTIVITY_CATEGORIES.find(
    (c) => c.toLowerCase() === value.toLowerCase()
  );
  return match ?? "All";
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ActivityLogPage({ searchParams }: PageProps) {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  const params = await searchParams;
  const activeTab = normalizeTab(params.tab);
  const { page, offset, pageSize } = getPageParams(params);

  // Build the base query. `count: "exact"` gives us the total row count
  // so we can show "Page X of Y" and hide Next on the last page. We keep
  // the select list tight — only the columns the list row renders.
  let query = supabase
    .from("activity_log")
    .select(
      "id, event_type, description, created_at, actor:users!actor_id(full_name), house:houses!house_id(name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (houseFilter) {
    query = query.in("house_id", houseFilter);
  }

  // Apply the category filter server-side so pagination counts the right
  // subset. "All" skips the filter entirely; "Other" is "event_type not
  // in any mapped category".
  if (activeTab !== "All") {
    if (activeTab === "Other") {
      const mapped = allMappedEventTypes();
      if (mapped.length > 0) {
        // `.not("event_type", "in", "(a,b,c)")` — the tuple form is how
        // PostgREST consumes NOT IN. No quoting needed for our ASCII
        // event_type values.
        query = query.not("event_type", "in", `(${mapped.join(",")})`);
      }
    } else {
      const events = eventTypesForCategory(activeTab);
      if (events.length > 0) {
        query = query.in("event_type", events);
      } else {
        // Safety: no mapped events → this tab is empty by definition.
        query = query.eq("event_type", "__never__");
      }
    }
  }

  const { data: logs, count } = await query.range(offset, offset + pageSize - 1);

  const normalized = ((logs ?? []) as ActivityLogRow[]).map((l) => ({
    id: l.id,
    event_type: l.event_type,
    description: l.description,
    created_at: l.created_at,
    actor: firstOrNull(l.actor),
    house: firstOrNull(l.house),
  }));

  const meta = buildPaginationMeta(count ?? 0, page, pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-muted-foreground">
          Recent activity across all houses
        </p>
      </div>
      <ActivityView
        logs={normalized}
        activeTab={activeTab}
        meta={meta}
        searchParams={params}
      />
    </div>
  );
}
