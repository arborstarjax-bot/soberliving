import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Home,
  Users,
  Bed,
  ClipboardCheck,
  DollarSign,
  CalendarClock,
  Activity,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Staff fallback dashboard — each stat tile and the recent-activity
 * feed are their own `<Suspense>` islands so one slow count doesn't
 * hold up the rest of the page. The resident dashboard has its own
 * section component at `./resident-dashboard-section.tsx`.
 *
 * Admins and managers are redirected to `/admin` from `page.tsx`,
 * so in practice this renders only for users with no assigned role
 * (i.e. an auth edge case). The cards still stream correctly though.
 */

/**
 * Upper bound on the number of rows any single stat-tile query will
 * fetch / scan. Replaces `count: "exact", head: true` — which forces
 * a full-table COUNT aggregate — with a cheap `.limit(CAP + 1)` row
 * fetch. Tiles render the raw count up to CAP and collapse to
 * "`CAP`+" beyond that. 500 is generous enough that a staff
 * dashboard almost always shows the real number; only pathological
 * backlogs get the cap treatment.
 */
const CAP = 500;

function displayCount(n: number): string {
  return n > CAP ? `${CAP}+` : String(n);
}

function StatShell({
  label,
  icon: Icon,
  href,
  children,
}: {
  label: string;
  icon: LucideIcon;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href}>
      <Card className="hover:bg-muted/50 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </span>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </Link>
  );
}

export function StatTileFallback({
  label,
  icon,
  href,
}: {
  label: string;
  icon: LucideIcon;
  href: string;
}) {
  return (
    <StatShell label={label} icon={icon} href={href}>
      <Skeleton className="h-8 w-12" />
    </StatShell>
  );
}

export async function HousesStatTile({
  houseFilter,
}: {
  houseFilter: string[] | null;
}) {
  const supabase = await createClient();
  let q = supabase
    .from("houses")
    .select("id")
    .eq("is_active", true)
    .limit(CAP + 1);
  if (houseFilter) q = q.in("id", houseFilter);
  const { data } = await q;
  return (
    <StatShell label="Houses" icon={Home} href="/houses">
      <div className="text-2xl font-bold">{displayCount(data?.length ?? 0)}</div>
    </StatShell>
  );
}

export async function ActiveResidentsStatTile({
  houseFilter,
}: {
  houseFilter: string[] | null;
}) {
  const supabase = await createClient();
  let q = supabase
    .from("residents")
    .select("id")
    .eq("status", "active")
    .limit(CAP + 1);
  if (houseFilter) q = q.in("house_id", houseFilter);
  const { data } = await q;
  return (
    <StatShell label="Active Residents" icon={Users} href="/residents">
      <div className="text-2xl font-bold">{displayCount(data?.length ?? 0)}</div>
    </StatShell>
  );
}

export async function OpenBedsStatTile({
  houseFilter,
}: {
  houseFilter: string[] | null;
}) {
  const supabase = await createClient();
  // Bed labels suffixed " [Not Available]" / " [Empty]" are considered
  // occupied for the purposes of the Open Beds tile — matches Houses
  // list behavior from PR #63.
  let q = supabase
    .from("beds")
    .select("id, label, room:rooms!inner(house_id), bed_assignments(id, end_date)")
    .eq("is_active", true);
  if (houseFilter) q = q.in("room.house_id", houseFilter);
  const { data: bedRows } = await q;
  const totalBeds = bedRows?.length ?? 0;
  let occupiedBeds = 0;
  for (const b of bedRows ?? []) {
    const label: string = (b as { label: string | null }).label ?? "";
    const isUnavailable =
      label.endsWith(" [Not Available]") || label.endsWith(" [Empty]");
    const assignments =
      (b as { bed_assignments?: { end_date: string | null }[] })
        .bed_assignments ?? [];
    const hasActive = assignments.some((a) => !a.end_date);
    if (hasActive || isUnavailable) occupiedBeds++;
  }
  return (
    <StatShell label="Open Beds" icon={Bed} href="/houses">
      <div className="text-2xl font-bold">
        {Math.max(0, totalBeds - occupiedBeds)}
      </div>
    </StatShell>
  );
}

export async function ChoreReviewsStatTile({
  houseFilter,
}: {
  houseFilter: string[] | null;
}) {
  const supabase = await createClient();
  let count: number;
  if (houseFilter) {
    // chore_signoffs has no denormalized house_id, so the filter has
    // to walk the chore_rotation_assignments -> chore_rotations join
    // client-side. Push the filter into PostgREST via the inner-join
    // dot path so the DB returns only rows for the manager's houses,
    // then cap at CAP + 1 rows for display.
    //
    // Note on the no-limit version of this query: PostgREST enforces
    // `max_rows = 1000` globally (supabase/config.toml:18), so
    // omitting .limit() would silently cap at 1000 rows — same
    // class of silent-undercount bug the PR #79 regression produced
    // at 500. Keep the filter-pushdown + explicit cap.
    const { data } = await supabase
      .from("chore_signoffs")
      .select(
        "id, rotation_assignment:chore_rotation_assignments!inner(rotation:chore_rotations!inner(house_id))"
      )
      .eq("status", "completed_pending_review")
      .in("rotation_assignment.rotation.house_id", houseFilter)
      .limit(CAP + 1);
    count = data?.length ?? 0;
  } else {
    const { data } = await supabase
      .from("chore_signoffs")
      .select("id")
      .eq("status", "completed_pending_review")
      .limit(CAP + 1);
    count = data?.length ?? 0;
  }
  return (
    <StatShell label="Chore Reviews" icon={ClipboardCheck} href="/chores">
      <div className="text-2xl font-bold">{displayCount(count)}</div>
    </StatShell>
  );
}

export async function PendingPaymentsStatTile({
  houseFilter,
}: {
  houseFilter: string[] | null;
}) {
  const supabase = await createClient();
  // payments has house_id as a direct column — push the filter into
  // the query so we don't fetch rows we'll discard client-side.
  let q = supabase
    .from("payments")
    .select("id")
    .eq("status", "pending")
    .limit(CAP + 1);
  if (houseFilter) q = q.in("house_id", houseFilter);
  const { data } = await q;
  return (
    <StatShell label="Pending Payments" icon={DollarSign} href="/payments">
      <div className="text-2xl font-bold">{displayCount(data?.length ?? 0)}</div>
    </StatShell>
  );
}

export async function LeaveRequestsStatTile({
  houseFilter,
}: {
  houseFilter: string[] | null;
}) {
  const supabase = await createClient();
  let count: number;
  if (houseFilter) {
    // leave_requests has no denormalized house_id — push the
    // filter into PostgREST via the residents!inner join dot
    // path so the DB returns only rows for the manager's
    // houses, then cap at CAP + 1 rows for display.
    //
    // Note on the no-limit version of this query: PostgREST
    // enforces `max_rows = 1000` globally
    // (supabase/config.toml:18), so omitting .limit() would
    // silently cap at 1000 rows — same class of silent-
    // undercount bug PR #79 produced at 500. Keep the filter-
    // pushdown + explicit cap.
    const { data } = await supabase
      .from("leave_requests")
      .select("id, resident:residents!inner(house_id)")
      .eq("status", "pending")
      .in("resident.house_id", houseFilter)
      .limit(CAP + 1);
    count = data?.length ?? 0;
  } else {
    const { data } = await supabase
      .from("leave_requests")
      .select("id")
      .eq("status", "pending")
      .limit(CAP + 1);
    count = data?.length ?? 0;
  }
  return (
    <StatShell
      label="Leave Requests"
      icon={CalendarClock}
      href="/leave-requests"
    >
      <div className="text-2xl font-bold">{displayCount(count)}</div>
    </StatShell>
  );
}

function EventIcon({ eventType }: { eventType: string }) {
  const iconClass = "h-4 w-4 mt-0.5 shrink-0 text-muted-foreground";
  switch (eventType) {
    case "move_in":
    case "move_out":
      return <Users className={iconClass} />;
    case "bed_assigned":
    case "bed_vacated":
      return <Bed className={iconClass} />;
    case "chore_assigned":
    case "chore_completed":
    case "chore_approved":
    case "chore_rejected":
      return <ClipboardCheck className={iconClass} />;
    case "incident_logged":
      return <AlertTriangle className={iconClass} />;
    case "leave_requested":
    case "leave_approved":
    case "leave_denied":
      return <CalendarClock className={iconClass} />;
    case "payment_recorded":
    case "payment_voided":
    case "rent_config_updated":
      return <DollarSign className={iconClass} />;
    default:
      return <Activity className={iconClass} />;
  }
}

export async function RecentActivitySection({
  houseFilter,
}: {
  houseFilter: string[] | null;
}) {
  const supabase = await createClient();
  let q = supabase
    .from("activity_log")
    .select("id, event_type, description, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (houseFilter) q = q.in("house_id", houseFilter);
  const { data: recentActivity } = await q;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {recentActivity && recentActivity.length > 0 ? (
          <div className="space-y-3">
            {recentActivity.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 text-sm"
              >
                <EventIcon eventType={entry.event_type} />
                <div className="flex-1 min-w-0">
                  <p>{entry.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString("en-US", {
                      timeZone: "America/New_York",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recent activity</p>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentActivityFallback() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
