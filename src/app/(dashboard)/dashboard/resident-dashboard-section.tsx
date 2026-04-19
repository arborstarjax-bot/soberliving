import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ListChecks } from "lucide-react";
import { getDaysSober, isSobrietyDateFuture } from "@/lib/milestones";
import {
  getHouseToday,
  DEFAULT_TIMEZONE,
  formatDateOnly,
} from "@/lib/timezone";
import { SobrietyDateSetter } from "./sobriety-date-setter";
import { SignOutToggle } from "../sign-out-sheet/sign-out-toggle";

/**
 * Resident dashboard body. Rendered inside a `<Suspense>` boundary
 * from `page.tsx` so the header and "Welcome, …" line paint
 * immediately while the resident profile + chore/leave/payment
 * lookups stream in.
 *
 * The critical path here is the first `residents` fetch — every
 * downstream query keys off `resident.id`. All the downstream
 * lookups run in a single `Promise.all` so only one round-trip
 * serializes on the client-visible timeline.
 */
export async function ResidentDashboardSection({
  userId,
}: {
  userId: string;
}) {
  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("*, bed_assignments(*, bed:beds(*, room:rooms(*)))")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!resident) {
    return (
      <p className="text-muted-foreground">
        No resident profile found. Please contact your house manager.
      </p>
    );
  }

  const { data: myRotationAssignments } = await supabase
    .from("chore_rotation_assignments")
    .select(
      "*, chore:chores(name, days_of_week), rotation:chore_rotations(cycle_start_date, cycle_end_date, is_current), chore_signoffs(*)"
    )
    .eq("resident_id", resident.id)
    .limit(10);

  const { data: myLeaveRequests } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("resident_id", resident.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const [openSignOutRes, restrictionsRes, nextDueRes] = await Promise.all([
    supabase
      .from("sign_out_sheet")
      .select("id, destination, time_out")
      .eq("resident_id", resident.id)
      .is("time_in", null)
      .maybeSingle(),
    supabase
      .from("restrictions")
      .select("restriction_type")
      .eq("resident_id", resident.id)
      .eq("is_active", true),
    supabase
      .from("payment_charges")
      .select("id, amount, paid_amount, due_date, charge_type")
      .eq("resident_id", resident.id)
      .in("status", ["open", "partial"])
      .order("due_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const openSignOut = openSignOutRes.data ?? null;
  const residentHasNoLeave = (restrictionsRes.data ?? []).some(
    (r) => (r as { restriction_type: string }).restriction_type === "no_leave"
  );
  const nextDueCharge =
    (nextDueRes?.data as unknown as {
      id: string;
      amount: number;
      paid_amount: number;
      due_date: string;
      charge_type: string;
    } | null) ?? null;

  const activeBeds = resident.bed_assignments?.filter(
    (ba: { end_date: string | null }) => !ba.end_date
  );

  const todayStr = getHouseToday(DEFAULT_TIMEZONE);
  const rotationRows =
    (myRotationAssignments ?? []) as unknown as Array<{
      id: string;
      chore: { name: string; days_of_week: string[] | null } | null;
      rotation: { is_current: boolean } | null;
      chore_signoffs: Array<{
        sign_off_date: string;
        day_of_week: string;
        status: string;
      }> | null;
    }>;
  let choresDueTodayCount = 0;
  const choreNames = new Set<string>();
  for (const ra of rotationRows) {
    // Defense-in-depth against stale signoffs: if the chore's
    // schedule was edited (e.g. Sunday → Monday) after a rotation
    // started but before `regenerateFutureSignoffsForChore` shipped,
    // old pending signoffs still sit in the DB with the wrong
    // `day_of_week`. Ignore any that no longer match the chore's
    // current `days_of_week`.
    const choreDays = ra.chore?.days_of_week ?? null;
    for (const s of ra.chore_signoffs ?? []) {
      if (
        s.sign_off_date === todayStr &&
        (s.status === "pending" || s.status === "redo") &&
        (choreDays === null || choreDays.includes(s.day_of_week))
      ) {
        choresDueTodayCount++;
        if (ra.chore?.name) choreNames.add(ra.chore.name);
      }
    }
  }
  const choresDueTodayLabel =
    choresDueTodayCount > 0 ? Array.from(choreNames).join(", ") : null;

  return (
    <div className="space-y-6">
      {!residentHasNoLeave && (
        <SignOutToggle
          residentId={resident.id}
          residentName={resident.full_name}
          openSignOut={openSignOut}
        />
      )}

      {choresDueTodayCount > 0 && (
        <Link href="/chores" className="block">
          <div className="rounded-2xl border-2 border-amber-500 bg-amber-500 p-5 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 active:scale-[0.99] transition">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-white/90">
                  Chore Due Today
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-bold truncate">
                  <ListChecks className="h-5 w-5 shrink-0" />
                  {choresDueTodayCount === 1
                    ? "1 chore to sign off"
                    : `${choresDueTodayCount} chores to sign off`}
                </p>
                {choresDueTodayLabel && (
                  <p className="mt-1 text-xs text-white/90 truncate">
                    {choresDueTodayLabel}
                  </p>
                )}
              </div>
              <div className="h-14 min-w-[7rem] rounded-md bg-white text-amber-700 font-bold flex items-center justify-center px-4 text-base">
                Sign Off
              </div>
            </div>
          </div>
        </Link>
      )}

      {nextDueCharge && (() => {
        const balance =
          Number(nextDueCharge.amount) - Number(nextDueCharge.paid_amount);
        const todayIso = getHouseToday();
        const pastDue = nextDueCharge.due_date < todayIso;
        const [y, m, d] = nextDueCharge.due_date.split("-").map(Number);
        const dueLabel = new Date(
          y,
          (m ?? 1) - 1,
          d ?? 1
        ).toLocaleDateString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        return (
          <Link href="/payments" className="block">
            <Card
              className={
                pastDue
                  ? "border-red-500/40 bg-red-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }
            >
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      pastDue ? "text-red-600" : "text-amber-600"
                    }`}
                  >
                    {pastDue
                      ? "Past Due"
                      : nextDueCharge.charge_type === "rent"
                        ? "Next Rent Due"
                        : "Next Payment Due"}
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(balance)}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Due {dueLabel}
                  </p>
                </div>
                <DollarSign
                  className={`h-8 w-8 shrink-0 ${
                    pastDue ? "text-red-500/60" : "text-amber-500/60"
                  }`}
                />
              </CardContent>
            </Card>
          </Link>
        );
      })()}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">My Room</CardTitle>
          </CardHeader>
          <CardContent>
            {activeBeds && activeBeds.length > 0 ? (
              <div>
                {activeBeds.map(
                  (ba: {
                    id: string;
                    bed: { label: string; room: { name: string } };
                  }) => (
                    <p key={ba.id} className="text-lg font-semibold">
                      {ba.bed.room.name} — {ba.bed.label}
                    </p>
                  )
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No bed assigned</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Sobriety</CardTitle>
          </CardHeader>
          <CardContent>
            {resident.sobriety_date ? (
              <div>
                <p className="text-2xl font-bold">
                  {getDaysSober(resident.sobriety_date)} days
                </p>
                <p className="text-xs text-muted-foreground">
                  {isSobrietyDateFuture(resident.sobriety_date)
                    ? `Starts ${formatDateOnly(resident.sobriety_date)}`
                    : `Since ${formatDateOnly(resident.sobriety_date)}`}
                </p>
              </div>
            ) : (
              <SobrietyDateSetter currentDate={resident.sobriety_date} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="capitalize">
              {resident.status}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My Chores</CardTitle>
        </CardHeader>
        <CardContent>
          {rotationRows.length > 0 ? (
            <div className="space-y-2">
              {rotationRows
                .filter((ra) => ra.rotation?.is_current)
                .map((ra) => {
                  const signoffs = ra.chore_signoffs ?? [];
                  const pending = signoffs.filter(
                    (s) => s.status === "pending"
                  ).length;
                  const approved = signoffs.filter(
                    (s) => s.status === "approved"
                  ).length;
                  return (
                    <div
                      key={ra.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div>
                        <p className="font-medium">{ra.chore?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {approved}/{signoffs.length} completed · {pending}{" "}
                          pending
                        </p>
                      </div>
                      <Link href="/chores">
                        <Badge variant="outline">View</Badge>
                      </Link>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No chores assigned this cycle
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leave Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {myLeaveRequests && myLeaveRequests.length > 0 ? (
            <div className="space-y-2">
              {myLeaveRequests.map((lr) => (
                <div
                  key={lr.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm">
                      {formatDateOnly(lr.departure_date)} —{" "}
                      {formatDateOnly(lr.expected_return_date)}
                    </p>
                    {lr.reason && (
                      <p className="text-xs text-muted-foreground">
                        {lr.reason}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      lr.status === "denied"
                        ? "destructive"
                        : lr.status === "approved"
                          ? "secondary"
                          : "outline"
                    }
                    className="capitalize"
                  >
                    {lr.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No leave requests
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
