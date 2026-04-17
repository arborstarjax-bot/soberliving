import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignOutToggle } from "./sign-out-toggle";
import { SignInOnBehalfDialog } from "./sign-in-on-behalf-dialog";
import { MapPin, Clock } from "lucide-react";

interface SignOutRow {
  id: string;
  resident_id: string;
  house_id: string;
  destination: string;
  notes: string | null;
  time_out: string;
  time_in: string | null;
  resident: { full_name: string; user_id: string | null } | null;
  house: { name: string } | null;
  signed_out_by_user: { full_name: string } | null;
  signed_in_by_user: { full_name: string } | null;
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

export default async function SignOutSheetPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const isStaff = user.role === "admin" || user.role === "manager";

  let residentId: string | null = null;
  let hasNoLeave = false;
  let residentName = user.full_name;
  if (user.role === "resident") {
    const { data: myResident } = await supabase
      .from("residents")
      .select("id, full_name")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    residentId = myResident?.id ?? null;
    residentName = myResident?.full_name ?? user.full_name;

    if (residentId) {
      const { data: restrictions } = await supabase
        .from("restrictions")
        .select("restriction_type")
        .eq("resident_id", residentId)
        .eq("is_active", true);
      hasNoLeave = (restrictions ?? []).some((r) =>
        ["no_leave", "house_commitment"].includes(
          (r as { restriction_type: string }).restriction_type
        )
      );
    }
  }

  const selectCols =
    "id, resident_id, house_id, destination, notes, time_out, time_in, " +
    "resident:residents(full_name, user_id), " +
    "house:houses(name), " +
    "signed_out_by_user:users!signed_out_by(full_name), " +
    "signed_in_by_user:users!signed_in_by(full_name)";

  let query = supabase
    .from("sign_out_sheet")
    .select(selectCols)
    .order("time_out", { ascending: false })
    .limit(200);

  if (user.role === "resident") {
    if (residentId) query = query.eq("resident_id", residentId);
    else query = query.eq("resident_id", "00000000-0000-0000-0000-000000000000");
  } else if (houseFilter) {
    query = query.in("house_id", houseFilter);
  }

  const { data: rows } = await query;
  const allRows = (rows ?? []) as unknown as SignOutRow[];
  const openRows = allRows.filter((r) => !r.time_in);
  const closedRows = allRows.filter((r) => !!r.time_in);
  const myOpen =
    user.role === "resident" && residentId
      ? openRows.find((r) => r.resident_id === residentId) ?? null
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sign Out Sheet</h1>
        <p className="text-sm text-muted-foreground">
          {isStaff
            ? "Who's currently out and recent sign-out history."
            : "Your recent sign-out history."}
        </p>
      </div>

      {user.role === "resident" && residentId && !hasNoLeave && (
        <SignOutToggle
          residentId={residentId}
          residentName={residentName}
          openSignOut={
            myOpen
              ? {
                  id: myOpen.id,
                  destination: myOpen.destination,
                  time_out: myOpen.time_out,
                }
              : null
          }
        />
      )}
      {user.role === "resident" && hasNoLeave && (
        <Card className="border-red-500/30">
          <CardContent className="py-4 text-sm text-red-500">
            You have an active No Leave restriction. Talk to your house manager.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Currently Out
            <Badge variant="secondary" className="ml-2">
              {openRows.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {openRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is signed out right now.</p>
          ) : (
            <ul className="divide-y">
              {openRows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {r.resident?.full_name ?? "Unknown"}
                      {isStaff && r.house?.name && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          · {r.house.name}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground truncate">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {r.destination}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      Out since {new Date(r.time_out).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {" · "}
                      {formatDuration(r.time_out, new Date().toISOString())}
                    </p>
                  </div>
                  {isStaff && (
                    <SignInOnBehalfDialog
                      signOutId={r.id}
                      residentName={r.resident?.full_name ?? "this resident"}
                      destination={r.destination}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {closedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sign-out history yet.</p>
          ) : (
            <ul className="divide-y">
              {closedRows.map((r) => (
                <li key={r.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {r.resident?.full_name ?? "Unknown"}
                      {isStaff && r.house?.name && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          · {r.house.name}
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
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Out {new Date(r.time_out).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {r.time_in && (
                      <>
                        {" → In "}
                        {new Date(r.time_in).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </>
                    )}
                    {r.signed_in_by_user?.full_name && isStaff && (
                      <span className="ml-1">
                        · signed in by {r.signed_in_by_user.full_name}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
