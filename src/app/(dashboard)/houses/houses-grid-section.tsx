import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CursorPager } from "@/components/cursor-pager";
import {
  DEFAULT_PAGE_SIZE,
  applyCursor,
  buildCursorHref,
  encodeCursor,
  parseCursor,
  sliceForPage,
  type Cursor,
} from "@/lib/cursor";

export interface HousesGridSectionProps {
  /**
   * `null` → user can see all active houses (admin).
   * Otherwise a list of house ids the user is assigned to.
   */
  houseFilter: string[] | null;
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * Houses grid — the heavy bed/assignment join lives here so the page
 * shell (header + Create button) paints immediately.
 *
 * Pagination: houses are sorted alphabetically by `name`. The cursor
 * captures `(name, id)` rather than the generic `(created_at, id)`
 * — both indexed, both stable. Most deployments have <20 houses so
 * "Next" is usually a no-op, but the cursor keeps large orgs fast.
 */
export async function HousesGridSection({
  houseFilter,
  searchParams,
}: HousesGridSectionProps) {
  const supabase = await createClient();
  const cursor = parseCursor(searchParams.c);

  let query = supabase
    .from("houses")
    .select(
      "id, name, address, rooms(id, is_active, beds(id, is_active, label, bed_assignments(id, end_date)))"
    )
    .eq("is_active", true)
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .limit(DEFAULT_PAGE_SIZE + 1);

  if (houseFilter) {
    query = query.in("id", houseFilter);
  }

  // Cursor keyed on `(name, id)` — alphabetical pagination. Routed
  // through `applyCursor` so the interpolated values are correctly
  // double-quoted (house names can legitimately contain `,()` which
  // would otherwise break the PostgREST `.or(...)` parser).
  query = applyCursor(query, cursor, {
    tsColumn: "name",
    idColumn: "id",
    direction: "asc",
  });

  const { data: rawHouses, error } = await query;
  if (error) {
    return (
      <div className="rounded-xl border bg-red-50 border-red-200 p-4 text-sm text-red-700">
        Failed to load houses: {error.message}
      </div>
    );
  }

  type HouseRow = {
    id: string;
    name: string;
    address: string | null;
    rooms: Array<{
      is_active: boolean;
      beds: Array<{
        is_active: boolean;
        label: string | null;
        bed_assignments: Array<{ end_date: string | null }>;
      }>;
    }>;
  };
  const all = (rawHouses ?? []) as unknown as HouseRow[];
  const hasNext = all.length > DEFAULT_PAGE_SIZE;
  const houses = hasNext ? all.slice(0, DEFAULT_PAGE_SIZE) : all;
  const nextCursor: Cursor | null = hasNext
    ? { ts: houses[houses.length - 1].name, id: houses[houses.length - 1].id }
    : null;

  const withOccupancy = houses.map((house) => {
    let totalBeds = 0;
    let occupiedBeds = 0;
    for (const room of house.rooms ?? []) {
      if (!room.is_active) continue;
      for (const bed of room.beds ?? []) {
        if (!bed.is_active) continue;
        totalBeds++;
        const hasActive = (bed.bed_assignments ?? []).some(
          (ba) => !ba.end_date
        );
        const label = bed.label ?? "";
        const isUnavailable =
          label.endsWith(" [Not Available]") || label.endsWith(" [Empty]");
        if (hasActive || isUnavailable) occupiedBeds++;
      }
    }
    return { ...house, totalBeds, occupiedBeds };
  });

  // Cursor-stack back navigation.
  const cpRaw = searchParams.cp;
  const cpList: string[] = Array.isArray(cpRaw)
    ? cpRaw.filter(Boolean)
    : cpRaw
      ? cpRaw.split(",").filter(Boolean)
      : [];

  const prevHref: string | null = cursor
    ? (() => {
        if (cpList.length === 0) {
          return buildCursorHref(
            "/houses",
            { ...searchParams, cp: undefined, c: undefined },
            null
          );
        }
        const newCp = cpList.slice(0, -1);
        const prevEnc = cpList[cpList.length - 1];
        return buildCursorHref(
          "/houses",
          { ...searchParams, cp: newCp.length ? newCp.join(",") : undefined },
          parseCursor(prevEnc)
        );
      })()
    : null;

  const nextHref: string | null = nextCursor
    ? buildCursorHref(
        "/houses",
        {
          ...searchParams,
          cp: (cursor ? [...cpList, encodeCursor(cursor)] : cpList).join(",")
            || undefined,
        },
        nextCursor
      )
    : null;

  if (withOccupancy.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Home className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No houses to show.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {withOccupancy.map((house) => (
          <Link key={house.id} href={`/houses/${house.id}`}>
            <Card className="hover:bg-muted/50 transition-colors h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{house.name}</CardTitle>
                  <Badge variant="outline">
                    {house.occupiedBeds}/{house.totalBeds} beds
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {house.address && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {house.address}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${house.totalBeds > 0 ? (house.occupiedBeds / house.totalBeds) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {house.totalBeds > 0
                      ? Math.round(
                          (house.occupiedBeds / house.totalBeds) * 100
                        )
                      : 0}
                    %
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <CursorPager
        prevHref={prevHref}
        nextHref={nextHref}
        itemLabel="houses"
      />
    </div>
  );
}
