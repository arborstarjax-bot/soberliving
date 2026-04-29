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
  type ActiveResidentItem,
  type HouseItem,
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
//   - New Intakes (this week)  (expandable list)
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

export default async function AdminPage() {
  const user = await requireAuth();

  // Only admin and manager can access admin panel. Residents get
  // bounced to their own dashboard.
  if (user.role === "resident") {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  // Used for reads against tables whose RLS policies are scoped to the
  // row owner (e.g. `house_commitments` only lets a user see their own
  // row). Staff on this dashboard need to see everyone's pending
  // commitments, so those queries go through the service-role client,
  // the same way `intake-review/page.tsx` already does. This page is
  // already gated to admin/manager above, so bypassing RLS here is
  // consistent with the intake-review pattern.
  const adminClient = createAdminClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const isAdmin = user.role === "admin";

  const todayIso = getHouseToday();
  const weekStartIso = isoWeekStart(todayIso);

  // Houses + Active Residents were count-only NavCards; now they're
  // expandable lists like the rest. Fetch the actual rows so the
  // card can display who/what is behind the number.
  let housesListQuery = supabase
    .from("houses")
    .select("id, name, address")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (houseFilter) housesListQuery = housesListQuery.in("id", houseFilter);

  let residentsListQuery = supabase
    .from("residents")
    .select("id, full_name, house_id, house:houses(name)")
    .eq("status", "active")
    .order("full_name", { ascending: true });
  if (houseFilter) residentsListQuery = residentsListQuery.in("house_id", houseFilter);

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

  // New Intakes: combined view of three buckets so the dashboard
  // shows the full intake pipeline (not just residents who are
  // already activated):
  //   - active:            resident row with move_in_date this week.
  //   - pending_signature: commitment created, waiting on resident sig.
  //   - pending_review:    user finished intake form, not yet reviewed.
  // We also fetch user_id so we can dedupe against the
  // pending_signature bucket below: a resident row can be activated
  // (status='active', move_in_date set) while the commitment is still
  // `pending_resident_signature`. In that case the resident should
  // render as "Pending resident signature", not "Complete".
  let newIntakesActiveQuery = supabase
    .from("residents")
    .select("id, user_id, full_name, move_in_date, house:houses(name)")
    .eq("status", "active")
    .gte("move_in_date", weekStartIso)
    .order("move_in_date", { ascending: false });
  if (houseFilter)
    newIntakesActiveQuery = newIntakesActiveQuery.in("house_id", houseFilter);

  // NOTE: uses adminClient, not `supabase`. house_commitments RLS
  // prevents user-auth reads from seeing other users' rows, which
  // would leave this bucket empty for staff and break the "Pending
  // resident signature" label on the dashboard.
  //
  // We also deliberately do NOT filter on `parent_commitment_id is
  // null`. Both initial onboarding commitments and amendments can be
  // in `pending_resident_signature` status — and for an already-active
  // resident with a pending amendment, the dashboard should still
  // read "Pending resident signature" rather than "Complete" (dedupe
  // by user_id a few lines down collapses the active+pending rows
  // into one). A unique index (`uq_house_commitments_one_pending_per_user`)
  // guarantees at most one pending row per user, so we won't double-count.
  //
  // We also don't embed users in this query — the user row is fetched
  // separately below. Keeping it simple dodges any edge cases where
  // the embed returns null (e.g. intake users missing a public.users
  // row for any reason) and silently drops the resident from the list.
  let pendingSignatureQuery = adminClient
    .from("house_commitments")
    .select("id, user_id, created_at, house:houses(name)")
    .eq("status", "pending_resident_signature")
    .order("created_at", { ascending: false });
  if (houseFilter)
    pendingSignatureQuery = pendingSignatureQuery.in("house_id", houseFilter);

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
    { data: housesRaw },
    { data: residentsRaw },
    { data: signedOutRaw },
    { data: onOvernightRaw },
    { data: newIntakesActiveRaw },
    { data: pendingSignatureRaw },
    { data: missedChoresRaw },
    { data: myResidentRec },
  ] = await Promise.all([
    housesListQuery,
    residentsListQuery,
    signedOutQuery,
    leaveQueryBase,
    newIntakesActiveQuery,
    pendingSignatureQuery,
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

  type NewIntakeActiveRow = {
    id: string;
    user_id: string | null;
    full_name: string;
    move_in_date: string;
    house: { name: string } | { name: string }[] | null;
  };

  type PendingSignatureRow = {
    id: string;
    user_id: string;
    created_at: string;
    house: { name: string } | { name: string }[] | null;
  };
  const iso = (d: string) => d.slice(0, 10);
  const pendingSigRows =
    (pendingSignatureRaw as unknown as PendingSignatureRow[] | null) ?? [];

  // Fetch full names for the pending-signature user_ids via the admin
  // client — same pattern the pending_review block uses below. Done
  // here (not inside the Promise.all above) because we need the
  // user_ids from the commitments query first.
  const pendingSigUserIdList = Array.from(
    new Set(pendingSigRows.map((r) => r.user_id))
  );
  const { data: pendingSigUserRows } =
    pendingSigUserIdList.length > 0
      ? await adminClient
          .from("users")
          .select("id, full_name")
          .in("id", pendingSigUserIdList)
      : { data: [] as { id: string; full_name: string }[] };
  const pendingSigNameById = new Map(
    (pendingSigUserRows ?? []).map((u) => [u.id as string, u.full_name as string])
  );

  // Dedupe pending-signature rows by user_id. Unique index enforces
  // at most one pending row per user at the DB level, but we
  // defensively collapse here in case two rows sneak through.
  // No date filter — all pending-signature commitments are actionable.
  const seenPendingSigUserIds = new Set<string>();
  const newIntakesPendingSig: NewIntakeItem[] = pendingSigRows
    .filter((r) => {
      if (seenPendingSigUserIds.has(r.user_id)) return false;
      seenPendingSigUserIds.add(r.user_id);
      return true;
    })
    .map((r) => {
      const house = Array.isArray(r.house) ? r.house[0] : r.house;
      return {
        kind: "pending_signature" as const,
        id: r.user_id,
        full_name: pendingSigNameById.get(r.user_id) ?? "Unknown",
        dated: iso(r.created_at),
        house_name: house?.name ?? null,
        status_label: "Pending resident signature",
      };
    });

  // Build the active bucket _after_ pending_signature so we can
  // exclude residents whose commitment is still awaiting signature —
  // otherwise they'd render twice, once as "Pending resident
  // signature" and once (incorrectly) as "Complete".
  const pendingSigUserIds = new Set(
    newIntakesPendingSig.map((r) => r.id)
  );
  const newIntakesActive: NewIntakeItem[] = (
    (newIntakesActiveRaw as unknown as NewIntakeActiveRow[] | null) ?? []
  )
    .filter((r) => !r.user_id || !pendingSigUserIds.has(r.user_id))
    .map((r) => {
      const house = Array.isArray(r.house) ? r.house[0] : r.house;
      return {
        kind: "active" as const,
        id: r.id,
        full_name: r.full_name,
        dated: r.move_in_date,
        house_name: house?.name ?? null,
        status_label: "Complete",
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
  // page; otherwise they can sit unnoticed. They also render as the
  // "pending_review" rows inside the New Intakes card so staff can
  // see names + the date each form was submitted at a glance.
  let pendingIntakeCount = 0;
  let newIntakesPendingReview: NewIntakeItem[] = [];
  if (isAdmin) {
    const [{ data: intakeUsers }, { data: commitments }, { data: forms }] =
      await Promise.all([
        adminClient
          .from("users")
          .select("id, full_name, created_at")
          .eq("intake_completed", true)
          .eq("commitment_signed", false)
          .eq("is_active", true)
          .neq("account_status", "rejected"),
        adminClient.from("house_commitments").select("user_id"),
        adminClient
          .from("intake_forms")
          .select("user_id, updated_at")
          .eq("status", "completed"),
      ]);
    const reviewedUserIds = new Set(
      (commitments ?? []).map((c) => c.user_id as string)
    );
    const formDateByUser = new Map<string, string>();
    for (const f of forms ?? []) {
      const fRow = f as { user_id: string; updated_at: string };
      formDateByUser.set(fRow.user_id, fRow.updated_at);
    }
    const allPendingReviewUsers = (intakeUsers ?? []).filter(
      (u) => !reviewedUserIds.has((u as { id: string }).id)
    );
    // Banner count: ALL unreviewed intakes regardless of date.
    pendingIntakeCount = allPendingReviewUsers.length;
    // Card rows: only this week's pending reviews.
    const thisWeekPendingReview = allPendingReviewUsers.filter(
      (u) => (u as { created_at: string }).created_at >= weekStartIso
    );
    newIntakesPendingReview = thisWeekPendingReview.map((u) => {
      const row = u as { id: string; full_name: string; created_at: string };
      const submitted = formDateByUser.get(row.id) ?? row.created_at;
      return {
        kind: "pending_review" as const,
        id: row.id,
        full_name: row.full_name,
        dated: iso(submitted),
        // House isn't assigned until admin reviews, so leave blank.
        house_name: null,
        status_label: "Awaiting staff review",
      };
    });
  }

  // Merge the three intake buckets. Order: pending_review first (most
  // actionable), then pending_signature, then complete/active.
  const newIntakes: NewIntakeItem[] = [
    ...newIntakesPendingReview,
    ...newIntakesPendingSig,
    ...newIntakesActive,
  ];

  type HouseRow = { id: string; name: string; address: string | null };
  const houseRows = (housesRaw as unknown as HouseRow[] | null) ?? [];

  type ResidentListRow = {
    id: string;
    full_name: string;
    house_id: string | null;
    house: { name: string } | { name: string }[] | null;
  };
  const residentRows =
    (residentsRaw as unknown as ResidentListRow[] | null) ?? [];

  const activeResidents: ActiveResidentItem[] = residentRows.map((r) => {
    const house = Array.isArray(r.house) ? r.house[0] : r.house;
    return {
      id: r.id,
      full_name: r.full_name,
      house_name: house?.name ?? null,
    };
  });

  // Resident count per house for the Houses card. Uses the same
  // already-fetched residents list so we don't pay for an extra trip.
  const residentsPerHouse = new Map<string, number>();
  for (const r of residentRows) {
    if (!r.house_id) continue;
    residentsPerHouse.set(r.house_id, (residentsPerHouse.get(r.house_id) ?? 0) + 1);
  }
  const houses: HouseItem[] = houseRows.map((h) => ({
    id: h.id,
    name: h.name,
    address: h.address ?? null,
    resident_count: residentsPerHouse.get(h.id) ?? 0,
  }));

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
        houses={houses}
        activeResidents={activeResidents}
        signedOut={signedOut}
        onOvernight={onOvernight}
        newIntakes={newIntakes}
        missedChores={missedChores}
      />
    </div>
  );
}
