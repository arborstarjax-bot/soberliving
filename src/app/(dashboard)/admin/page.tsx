import { requireAuth } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { getHouseToday } from "@/lib/timezone";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { SignOutToggle } from "../sign-out-sheet/sign-out-toggle";
import {
  DashboardGrid,
  type MissedChoreItem,
  type NewIntakeItem,
  type OnOvernightItem,
  type SignedOutItem,
} from "./dashboard-grid";

// Admin / Manager dashboard (the "/admin" landing page).
//
// Rewritten 2026-04 to focus on residents: staff open this page first
// thing in the morning to see who is signed out, who is on overnight,
// who just moved in, and what chores were missed this week. Anything
// operational (house management, chore config, payments, users) has
// its own top-level nav entry — we deliberately do NOT turn this
// page into a kitchen-sink tabbed hub again.
//
// The six cards are:
//   - Houses                   (navigation)
//   - Active Residents         (navigation)
//   - Signed Out               (expandable list)
//   - On Overnight             (expandable list)
//   - New Intakes (last 30d)   (expandable list)
//   - Missed Chores (this wk)  (expandable list)

// Returns the ISO date of Monday of the week containing `todayIso`.
// `todayIso` is a YYYY-MM-DD string already resolved in the app
// timezone. Weeks start Monday here because the chore rotation model
// uses Monday-start weeks.
function isoWeekStart(todayIso: string): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
  // Shift so Monday=0, ..., Sunday=6.
  const dayIdx = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dayIdx);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Returns the ISO date N days before `todayIso` (YYYY-MM-DD).
function isoDaysAgo(todayIso: string, days: number): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default async function AdminPage() {
  const user = await requireAuth();

  // Only admin and manager can access admin panel. Residents get
  // bounced to their own dashboard.
  if (user.role === "resident") {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const isAdmin = user.role === "admin";

  const todayIso = getHouseToday();
  const weekStartIso = isoWeekStart(todayIso);
  const thirtyDaysAgoIso = isoDaysAgo(todayIso, 30);

  // Count queries (run with head:true + count:exact to skip the row
  // payload). House scope goes through `.in("id", filter)` or
  // `.in("house_id", filter)` depending on the table.
  let housesCountQuery = supabase
    .from("houses")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (houseFilter) housesCountQuery = housesCountQuery.in("id", houseFilter);

  let residentsCountQuery = supabase
    .from("residents")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if (houseFilter) residentsCountQuery = residentsCountQuery.in("house_id", houseFilter);

  // Signed Out: open sign_out_sheet rows. Filter by house at the query
  // layer (sign_out_sheet has its own house_id column).
  let signedOutQuery = supabase
    .from("sign_out_sheet")
    .select(
      "id, destination, time_out, resident:residents(id, full_name, house_id, houses(name))"
    )
    .is("time_in", null)
    .order("time_out", { ascending: false });
  if (houseFilter) signedOutQuery = signedOutQuery.in("house_id", houseFilter);

  // On Overnight: approved leave requests that haven't been returned
  // yet. Filtering by house means filtering by the linked resident's
  // house_id, which can't be done natively on a foreign-table column
  // without !inner — we do that and then filter in-app as a
  // fallback for legacy rows.
  const leaveQueryBase = supabase
    .from("leave_requests")
    .select(
      "id, departure_date, expected_return_date, reason, resident:residents!inner(id, full_name, house_id, houses(name))"
    )
    .eq("status", "approved")
    .is("actual_return_date", null)
    .order("departure_date", { ascending: true });

  // New Intakes: residents with move_in_date >= 30d ago.
  let newIntakesQuery = supabase
    .from("residents")
    .select("id, full_name, move_in_date, house:houses(name)")
    .eq("status", "active")
    .gte("move_in_date", thirtyDaysAgoIso)
    .order("move_in_date", { ascending: false });
  if (houseFilter) newIntakesQuery = newIntakesQuery.in("house_id", houseFilter);

  // Missed Chores this week: chore_signoffs with status='missed' and
  // sign_off_date >= Monday of this week. We eager-load the
  // chore + resident + house so we can render a meaningful row
  // without a second lookup.
  const missedChoresQuery = supabase
    .from("chore_signoffs")
    .select(
      "id, sign_off_date, rotation_assignment:chore_rotation_assignments!inner(chore:chores!inner(name, house_id, house:houses(name)), resident:residents(full_name))"
    )
    .eq("status", "missed")
    .gte("sign_off_date", weekStartIso)
    .lte("sign_off_date", todayIso)
    .order("sign_off_date", { ascending: false });

  // Sign-out toggle for staff who are also residents — same
  // affordance as the resident dashboard.
  const meResidentQuery = supabase
    .from("residents")
    .select("id, full_name, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const [
    { count: houseCount },
    { count: activeResidentCount },
    { data: signedOutRaw },
    { data: onOvernightRaw },
    { data: newIntakesRaw },
    { data: missedChoresRaw },
    { data: myResidentRec },
  ] = await Promise.all([
    housesCountQuery,
    residentsCountQuery,
    signedOutQuery,
    leaveQueryBase,
    newIntakesQuery,
    missedChoresQuery,
    meResidentQuery,
  ]);

  // Shape + house-scope the raw rows into the props the client
  // component expects.
  type SignedOutRow = {
    id: string;
    destination: string;
    time_out: string;
    resident: {
      id: string;
      full_name: string;
      house_id: string;
      houses: { name: string } | { name: string }[] | null;
    } | null;
  };
  const signedOut: SignedOutItem[] = ((signedOutRaw as unknown as SignedOutRow[] | null) ?? [])
    .filter((r) => r.resident !== null)
    .map((r) => {
      const res = r.resident!;
      const house = Array.isArray(res.houses) ? res.houses[0] : res.houses;
      return {
        id: r.id,
        resident_id: res.id,
        resident_name: res.full_name,
        destination: r.destination,
        time_out: r.time_out,
        house_name: house?.name ?? null,
      };
    });

  type LeaveRow = {
    id: string;
    departure_date: string;
    expected_return_date: string;
    reason: string | null;
    resident: {
      id: string;
      full_name: string;
      house_id: string;
      houses: { name: string } | { name: string }[] | null;
    } | null;
  };
  const onOvernight: OnOvernightItem[] = ((onOvernightRaw as unknown as LeaveRow[] | null) ?? [])
    .filter((r) => {
      if (!r.resident) return false;
      if (!houseFilter) return true;
      return houseFilter.includes(r.resident.house_id);
    })
    .map((r) => {
      const res = r.resident!;
      const house = Array.isArray(res.houses) ? res.houses[0] : res.houses;
      return {
        id: r.id,
        resident_id: res.id,
        resident_name: res.full_name,
        departure_date: r.departure_date,
        expected_return_date: r.expected_return_date,
        reason: r.reason,
        house_name: house?.name ?? null,
      };
    });

  type NewIntakeRow = {
    id: string;
    full_name: string;
    move_in_date: string;
    house: { name: string } | { name: string }[] | null;
  };
  const newIntakes: NewIntakeItem[] = ((newIntakesRaw as unknown as NewIntakeRow[] | null) ?? [])
    .map((r) => {
      const house = Array.isArray(r.house) ? r.house[0] : r.house;
      return {
        id: r.id,
        full_name: r.full_name,
        move_in_date: r.move_in_date,
        house_name: house?.name ?? null,
      };
    });

  type MissedRow = {
    id: string;
    sign_off_date: string;
    rotation_assignment: {
      chore: {
        name: string;
        house_id: string;
        house: { name: string } | { name: string }[] | null;
      } | null;
      resident: { full_name: string } | { full_name: string }[] | null;
    } | null;
  };
  const missedChores: MissedChoreItem[] = ((missedChoresRaw as unknown as MissedRow[] | null) ?? [])
    .filter((r) => {
      const ra = r.rotation_assignment;
      if (!ra?.chore) return false;
      if (!houseFilter) return true;
      return houseFilter.includes(ra.chore.house_id);
    })
    .map((r) => {
      const ra = r.rotation_assignment!;
      const chore = ra.chore!;
      const residentObj = Array.isArray(ra.resident) ? ra.resident[0] : ra.resident;
      const houseObj = Array.isArray(chore.house) ? chore.house[0] : chore.house;
      return {
        id: r.id,
        resident_name: residentObj?.full_name ?? "Unknown",
        chore_name: chore.name,
        house_name: houseObj?.name ?? null,
        sign_off_date: r.sign_off_date,
      };
    });

  // Pending intake applications (admin only). Intake-completed users
  // who haven't been reviewed yet bump a banner at the top of the
  // page; otherwise they can sit unnoticed.
  let pendingIntakeCount = 0;
  if (isAdmin) {
    const adminClient = createAdminClient();
    const [{ data: intakeUsers }, { data: commitments }] = await Promise.all([
      adminClient
        .from("users")
        .select("id")
        .eq("intake_completed", true)
        .eq("commitment_signed", false)
        .eq("is_active", true)
        .neq("account_status", "rejected"),
      adminClient.from("house_commitments").select("user_id"),
    ]);
    const reviewedUserIds = new Set(
      (commitments ?? []).map((c) => c.user_id as string)
    );
    pendingIntakeCount = (intakeUsers ?? []).filter(
      (u) => !reviewedUserIds.has(u.id as string)
    ).length;
  }

  // Staff-as-resident sign-out toggle, same as the admin page had
  // before. If the logged-in staff member is also an active resident
  // they see the Sign Out / Sign In toggle pinned at the top.
  let myOpenSignOut: {
    id: string;
    destination: string;
    time_out: string;
  } | null = null;
  let myHasNoLeave = false;
  if (myResidentRec) {
    const [{ data: openRow }, { data: myRestrictions }] = await Promise.all([
      supabase
        .from("sign_out_sheet")
        .select("id, destination, time_out")
        .eq("resident_id", myResidentRec.id)
        .is("time_in", null)
        .maybeSingle(),
      supabase
        .from("restrictions")
        .select("restriction_type")
        .eq("resident_id", myResidentRec.id)
        .eq("is_active", true),
    ]);
    myOpenSignOut = openRow ?? null;
    myHasNoLeave = (myRestrictions ?? []).some(
      (r) =>
        (r as { restriction_type: string }).restriction_type === "no_leave"
    );
  }

  return (
    <div className="space-y-6">
      {myResidentRec && !myHasNoLeave && (
        <div>
          <SignOutToggle
            residentId={myResidentRec.id}
            residentName={myResidentRec.full_name}
            openSignOut={myOpenSignOut}
          />
        </div>
      )}
      {isAdmin && pendingIntakeCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            <span className="text-sm">
              {pendingIntakeCount} intake application
              {pendingIntakeCount === 1 ? "" : "s"} waiting for review.
            </span>
          </div>
          <Link
            href="/intake-review"
            className="text-sm font-medium underline underline-offset-2"
          >
            Review
          </Link>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? "At-a-glance view of every house and resident."
            : "At-a-glance view of your assigned houses and residents."}
        </p>
      </div>

      <DashboardGrid
        houseCount={houseCount ?? 0}
        activeResidentCount={activeResidentCount ?? 0}
        signedOut={signedOut}
        onOvernight={onOvernight}
        newIntakes={newIntakes}
        missedChores={missedChores}
      />
    </div>
  );
}
