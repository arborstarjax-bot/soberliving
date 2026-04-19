import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { CursorPager } from "@/components/cursor-pager";
import {
  DEFAULT_PAGE_SIZE,
  applyCursor,
  buildCursorHref,
  encodeCursor,
  parseCursor,
  sliceForPage,
} from "@/lib/cursor";
import type { SessionUser } from "@/lib/types";
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

interface ActivityListSectionProps {
  user: SessionUser;
  activeTab: (typeof ACTIVITY_CATEGORIES)[number];
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * Activity log list + cursor pager. Lives behind a `<Suspense>`
 * boundary on `page.tsx` so the header and tab strip paint
 * immediately.
 *
 * Replaces the prior offset-based pagination (which relied on an
 * O(n) `count: "exact"` scan) with 20-row cursor pagination keyed
 * on `(created_at desc, id desc)`. "Page X of Y" is dropped — the
 * pager now renders Prev/Next only, same contract as Bulletin /
 * Houses / Users.
 */
export async function ActivityListSection({
  user,
  activeTab,
  searchParams,
}: ActivityListSectionProps) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const cursor = parseCursor(searchParams.c);

  let query = supabase
    .from("activity_log")
    .select(
      "id, event_type, description, created_at, actor:users!actor_id(full_name), house:houses!house_id(name)"
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(DEFAULT_PAGE_SIZE + 1);

  if (houseFilter) query = query.in("house_id", houseFilter);

  if (activeTab !== "All") {
    if (activeTab === "Other") {
      const mapped = allMappedEventTypes();
      if (mapped.length > 0) {
        query = query.not("event_type", "in", `(${mapped.join(",")})`);
      }
    } else {
      const events = eventTypesForCategory(activeTab);
      if (events.length > 0) {
        query = query.in("event_type", events);
      } else {
        query = query.eq("event_type", "__never__");
      }
    }
  }

  query = applyCursor(query, cursor, {
    tsColumn: "created_at",
    idColumn: "id",
    direction: "desc",
  });

  const { data: rawLogs, error } = await query;

  if (error) {
    return (
      <div className="rounded-xl border bg-red-50 border-red-200 p-4 text-sm text-red-700">
        Failed to load activity: {error.message}
      </div>
    );
  }

  const typedLogs = (rawLogs ?? []) as ActivityLogRow[];
  const { rows, nextCursor } = sliceForPage(typedLogs);
  const logs = rows.map((l) => ({
    id: l.id,
    event_type: l.event_type,
    description: l.description,
    created_at: l.created_at,
    actor: firstOrNull(l.actor),
    house: firstOrNull(l.house),
  }));

  // cp= back-stack — same contract as the other cursor pagers.
  const cpRaw = Array.isArray(searchParams.cp)
    ? searchParams.cp[0]
    : searchParams.cp;
  const cpList: string[] = cpRaw ? cpRaw.split(",").filter(Boolean) : [];

  const prevHref: string | null = cursor
    ? (() => {
        if (cpList.length === 0) {
          return buildCursorHref(
            "/activity",
            { ...searchParams, cp: undefined, c: undefined },
            null
          );
        }
        const newCp = cpList.slice(0, -1);
        const prevEnc = cpList[cpList.length - 1];
        return buildCursorHref(
          "/activity",
          { ...searchParams, cp: newCp.length ? newCp.join(",") : undefined },
          parseCursor(prevEnc)
        );
      })()
    : null;

  const nextHref: string | null = nextCursor
    ? buildCursorHref(
        "/activity",
        {
          ...searchParams,
          cp: (cursor ? [...cpList, encodeCursor(cursor)] : cpList).join(","),
        },
        nextCursor
      )
    : null;

  if (logs.length === 0) {
    return (
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
    );
  }

  return (
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
                    <span>
                      {new Date(log.created_at).toLocaleString("en-US", {
                        timeZone: "America/New_York",
                      })}
                    </span>
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
        <CursorPager
          prevHref={prevHref}
          nextHref={nextHref}
          itemLabel="entries"
        />
      </CardContent>
    </Card>
  );
}
