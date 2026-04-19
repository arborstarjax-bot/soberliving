import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import { SignInOnBehalfDialog } from "./sign-in-on-behalf-dialog";

interface SignOutRow {
  id: string;
  destination: string;
  time_out: string;
  resident: { full_name: string } | { full_name: string }[] | null;
  house: { name: string } | { name: string }[] | null;
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

/**
 * Live "Currently Out" list. Always shows every open sign-out
 * scoped to the staff member's accessible houses — deliberately
 * NOT paginated and NOT affected by the History filter bar, since
 * staff need an at-a-glance view of who is out right now.
 */
export async function CurrentlyOutSection({ user }: { user: SessionUser }) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  const selectCols =
    "id, destination, time_out, " +
    "resident:residents(full_name), " +
    "house:houses(name)";

  let query = supabase
    .from("sign_out_sheet")
    .select(selectCols)
    .is("time_in", null)
    .order("time_out", { ascending: false });

  if (houseFilter) query = query.in("house_id", houseFilter);

  const { data } = await query;
  const rows = (data ?? []) as unknown as SignOutRow[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Currently Out
          <Badge variant="secondary" className="ml-2">
            {rows.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody is signed out right now.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const resident = firstOrNull(r.resident);
              const house = firstOrNull(r.house);
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {resident?.full_name ?? "Unknown"}
                      {house?.name && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          · {house.name}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground truncate">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {r.destination}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      Out since{" "}
                      {new Date(r.time_out).toLocaleString(undefined, {
                        timeZone: "America/New_York",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {" · "}
                      {formatDuration(r.time_out, new Date().toISOString())}
                    </p>
                  </div>
                  <SignInOnBehalfDialog
                    signOutId={r.id}
                    residentName={resident?.full_name ?? "this resident"}
                    destination={r.destination}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
