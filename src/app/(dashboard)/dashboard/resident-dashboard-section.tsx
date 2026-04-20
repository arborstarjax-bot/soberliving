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

  const [openSignOutRes, restrictionsRes, openChargesRes] = await Promise.all([
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
    // Pull every open/partial charge so the tile shows the FULL
    // amount due — rent + admin fee + any deposit, not just the
    // earliest single row. The previous `.limit(1)` under-counted
    // when a resident owed both rent and a move-in admin fee.
    supabase
      .from("payment_charges")
      .select("id, amount, paid_amount, due_date, charge_type")
      .eq("resident_id", resident.id)
      .in("status", ["open", "partial"])
      .order("due_date", { ascending: true }),
  ]);

  const openSignOut = openSignOutRes.data ?? null;
  const residentHasNoLeave = (restrictionsRes.data ?? []).some(
    (r) => (r as { restriction_type: string }).restriction_type === "no_leave"
  );
  const openCharges =
    (openChargesRes.data as unknown as Array<{
      id: string;
      amount: number;
      paid_amount: number;
      due_date: string;
      charge_type: string;
    }> | null) ?? [];

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

      {openCharges.length > 0 && (() => {
        // Aggregate every open/partial charge into a single "Amount
        // Due" tile. Previously the dashboard showed just the
        // earliest charge via .limit(1) — so a resident who owed
        // both rent and a move-in admin fee only saw rent. Now we
        // display the full balance with a per-charge breakdown
        // underneath, styled red if ANY charge is past due.
        const todayIso = getHouseToday();
        const chargesWithBalance = openCharges
          .map((c) => ({
            ...c,
            balance: Number(c.amount) - Number(c.paid_amount),
            isPastDue: c.due_date < todayIso,
          }))
          .filter((c) => c.balance > 0);
        if (chargesWithBalance.length === 0) return null;
        const totalBalance = chargesWithBalance.reduce(
          (s, c) => s + c.balance,
          0
        );
        const pastDueCount = chargesWithBalance.filter((c) => c.isPastDue)
          .length;
        const anyPastDue = pastDueCount > 0;
        const formatCurrency = (n: number) =>
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: n % 1 === 0 ? 0 : 2,
          }).format(n);
        const formatIsoDate = (iso: string) => {
          const [yy, mm, dd] = iso.split("-").map(Number);
          return new Date(yy, (mm ?? 1) - 1, dd ?? 1).toLocaleDateString(
            "en-US",
            {
              timeZone: "America/New_York",
              month: "short",
              day: "numeric",
            }
          );
        };
        const chargeLabel = (type: string) => {
          if (type === "rent") return "Rent";
          if (type === "admin_fee") return "Admin Fee";
          if (type === "deposit") return "Deposit";
          return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        };
        return (
          <Link href="/payments" className="block">
            <Card
              className={
                anyPastDue
                  ? "border-red-500/40 bg-red-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        anyPastDue ? "text-red-600" : "text-amber-600"
                      }`}
                    >
                      {anyPastDue ? "Amount Past Due" : "Amount Due"}
                    </p>
                    <p className="mt-1 text-2xl font-bold">
                      {formatCurrency(totalBalance)}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {chargesWithBalance.length === 1
                        ? "1 open charge"
                        : `${chargesWithBalance.length} open charges`}
                      {pastDueCount > 0
                        ? ` — ${pastDueCount} past due`
                        : null}
                    </p>
                  </div>
                  <DollarSign
                    className={`h-8 w-8 shrink-0 ${
                      anyPastDue ? "text-red-500/60" : "text-amber-500/60"
                    }`}
                  />
                </div>
                <ul className="divide-y divide-border/50 border-t border-border/50 text-sm">
                  {chargesWithBalance.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 py-1.5"
                    >
                      <span className="truncate">
                        <span className="font-medium">
                          {chargeLabel(c.charge_type)}
                        </span>
                        <span className="ml-2 text-muted-foreground">
                          due {formatIsoDate(c.due_date)}
                        </span>
                        {c.isPastDue && (
                          <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                            past due
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 font-semibold ${
                          c.isPastDue ? "text-red-600" : ""
                        }`}
                      >
                        {formatCurrency(c.balance)}
                      </span>
                    </li>
                  ))}
                </ul>
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
