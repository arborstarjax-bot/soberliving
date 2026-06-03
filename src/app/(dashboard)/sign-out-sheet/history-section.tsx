import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface SignOutRow {
  id: string;
  resident_id: string;
  house_id: string;
  destination: string;
  time_out: string;
  time_in: string | null;
  past_curfew: boolean;
  resident: { full_name: string } | { full_name: string }[] | null;
  house: { name: string } | { name: string }[] | null;
  signed_in_by_user:
    | { full_name: string }
    | { full_name: string }[]
    | null;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatDuration(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return remMins ? `${hrs}h ${remMins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs ? `${days}d ${remHrs}h` : `${days}d`;
}

function pickParam(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

/**
 * Completed-entry history for the sign-out sheet. Lives behind a
 * <Suspense> boundary on page.tsx so the shell + Currently Out
 * list can paint before this query runs.
 *
 * Supports three URL-driven filters (all written by FilterBar on
 * change, which also resets pagination):
 *   - resident=<resident_id>
 *   - from=YYYY-MM-DD       (interpreted as UTC midnight)
 *   - to=YYYY-MM-DD         (interpreted as end of that UTC day)
 *
 * Pagination mirrors the activity log: 20 rows per page, cursor
 * keyed on (time_out desc, id desc), back-stack encoded in `cp=`.
 */
export async function SignOutHistorySection({
  user,
  searchParams,
  pastCurfewOnly = false,
}: {
  user: SessionUser;
  searchParams: Record<string, string | string[] | undefined>;
  pastCurfewOnly?: boolean;
}) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const cursor = parseCursor(searchParams.c);

  const residentId = pickParam(searchParams.resident);
  const from = pickParam(searchParams.from);
  const to = pickParam(searchParams.to);

  const selectCols =
    "id, resident_id, house_id, destination, time_out, time_in, past_curfew, " +
    "resident:residents(full_name), " +
    "house:houses(name), " +
    "signed_in_by_user:users!signed_in_by(full_name)";

  let query = supabase
    .from("sign_out_sheet")
    .select(selectCols)
    .not("time_in", "is", null)
    .order("time_out", { ascending: false })
    .order("id", { ascending: false })
    .limit(DEFAULT_PAGE_SIZE + 1);

  if (houseFilter) query = query.in("house_id", houseFilter);
  if (pastCurfewOnly) query = query.eq("past_curfew", true);
  if (residentId) query = query.eq("resident_id", residentId);
  if (from) query = query.gte("time_out", `${from}T00:00:00.000Z`);
  if (to) query = query.lte("time_out", `${to}T23:59:59.999Z`);

  query = applyCursor(query, cursor, {
    tsColumn: "time_out",
    idColumn: "id",
    direction: "desc",
  });

  const { data, error } = await query;

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-700">
            Failed to load history: {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  const typed = (data ?? []) as unknown as SignOutRow[];
  const { rows, nextCursor } = sliceForPage(
    typed,
    DEFAULT_PAGE_SIZE,
    (r) => ({ ts: r.time_out, id: r.id }),
  );

  // cp= back-stack — same contract as activity / users / bulletin.
  const cpRaw = Array.isArray(searchParams.cp)
    ? searchParams.cp[0]
    : searchParams.cp;
  const cpList: string[] = cpRaw ? cpRaw.split(",").filter(Boolean) : [];

  const prevHref: string | null = cursor
    ? (() => {
        if (cpList.length === 0) {
          return buildCursorHref(
            "/sign-out-sheet",
            { ...searchParams, cp: undefined, c: undefined },
            null,
          );
        }
        const newCp = cpList.slice(0, -1);
        const prevEnc = cpList[cpList.length - 1];
        return buildCursorHref(
          "/sign-out-sheet",
          {
            ...searchParams,
            cp: newCp.length ? newCp.join(",") : undefined,
          },
          parseCursor(prevEnc),
        );
      })()
    : null;

  const nextHref: string | null = nextCursor
    ? buildCursorHref(
        "/sign-out-sheet",
        {
          ...searchParams,
          cp:
            (cursor ? [...cpList, encodeCursor(cursor)] : cpList).join(",") ||
            undefined,
        },
        nextCursor,
      )
    : null;

  const hasFilters = !!(residentId || from || to);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {pastCurfewOnly ? "Past Curfew" : "History"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "No sign-outs match the current filters."
              : "No sign-out history yet."}
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const resident = firstOrNull(r.resident);
              const house = firstOrNull(r.house);
              const signedIn = firstOrNull(r.signed_in_by_user);
              return (
                <li key={r.id} className={`py-3 text-sm ${r.past_curfew ? "border-l-2 border-red-500 pl-3" : ""}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {resident?.full_name ?? "Unknown"}
                      {house?.name && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          · {house.name}
                        </span>
                      )}
                      {r.past_curfew && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          PAST CURFEW
                        </span>
                      )}
                    </p>
                    {r.time_in && (
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(r.time_out, r.time_in)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {r.destination}
                  </p>
                  <p className={`mt-0.5 text-xs ${r.past_curfew ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                    Out{" "}
                    {new Date(r.time_out).toLocaleString(undefined, {
                      timeZone: "America/New_York",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {r.time_in && (
                      <>
                        {" → In "}
                        {new Date(r.time_in).toLocaleString(undefined, {
                          timeZone: "America/New_York",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </>
                    )}
                    {signedIn?.full_name && (
                      <span className="ml-1">
                        · signed in by {signedIn.full_name}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <CursorPager
          prevHref={prevHref}
          nextHref={nextHref}
          itemLabel="entries"
        />
      </CardContent>
    </Card>
  );
}
