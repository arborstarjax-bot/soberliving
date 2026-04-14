import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { getDaysSober } from "@/lib/milestones";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home, Users, ClipboardCheck, AlertTriangle, CalendarClock, Bed, Activity } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  // Resident dashboard
  if (user.role === "resident") {
    return <ResidentDashboard userId={user.id} />;
  }

  // Admin / Manager dashboard
  let housesQuery = supabase.from("houses").select("id", { count: "exact" }).eq("is_active", true);
  if (houseFilter) {
    housesQuery = housesQuery.in("id", houseFilter);
  }
  const { count: houseCount } = await housesQuery;

  let residentsQuery = supabase.from("residents").select("id", { count: "exact" }).eq("status", "active");
  if (houseFilter) {
    residentsQuery = residentsQuery.in("house_id", houseFilter);
  }
  const { count: residentCount } = await residentsQuery;

  let bedsQuery = supabase.from("beds").select("id, room:rooms!inner(house_id)", { count: "exact" }).eq("is_active", true);
  if (houseFilter) bedsQuery = bedsQuery.in("room.house_id", houseFilter);
  const { count: totalBeds } = await bedsQuery;

  let assignmentsQuery = supabase.from("bed_assignments").select("id, bed:beds!inner(room:rooms!inner(house_id))", { count: "exact" }).is("end_date", null);
  if (houseFilter) assignmentsQuery = assignmentsQuery.in("bed.room.house_id", houseFilter);
  const { count: occupiedBeds } = await assignmentsQuery;

  // For pending counts, fetch with joins and filter in-app for managers
  let pendingChoreReviews = 0;
  if (houseFilter) {
    const { data: pendingChores } = await supabase
      .from("chore_signoffs")
      .select("id, rotation_assignment:chore_rotation_assignments!inner(rotation:chore_rotations!inner(house_id))")
      .eq("status", "completed_pending_review");
    pendingChoreReviews = (pendingChores ?? []).filter((s) => {
      const ra = s.rotation_assignment as unknown as { rotation: { house_id: string } } | null;
      return houseFilter.includes(ra?.rotation?.house_id ?? "");
    }).length;
  } else {
    const { count } = await supabase
      .from("chore_signoffs")
      .select("id", { count: "exact" })
      .eq("status", "completed_pending_review");
    pendingChoreReviews = count ?? 0;
  }

  let pendingLeaveRequests = 0;
  if (houseFilter) {
    const { data: pendingLeave } = await supabase
      .from("leave_requests")
      .select("id, resident:residents!inner(house_id)")
      .eq("status", "pending");
    pendingLeaveRequests = (pendingLeave ?? []).filter((lr) => {
      const r = lr.resident as unknown as { house_id: string } | null;
      return houseFilter.includes(r?.house_id ?? "");
    }).length;
  } else {
    const { count } = await supabase
      .from("leave_requests")
      .select("id", { count: "exact" })
      .eq("status", "pending");
    pendingLeaveRequests = count ?? 0;
  }

  // Recent activity
  let activityQuery = supabase
    .from("activity_log")
    .select("id, event_type, description, created_at, actor_id")
    .order("created_at", { ascending: false })
    .limit(10);
  if (houseFilter) {
    activityQuery = activityQuery.in("house_id", houseFilter);
  }
  const { data: recentActivity } = await activityQuery;

  const stats = [
    { label: "Houses", value: houseCount ?? 0, icon: Home, href: "/houses" },
    { label: "Active Residents", value: residentCount ?? 0, icon: Users, href: "/residents" },
    { label: "Open Beds", value: (totalBeds ?? 0) - (occupiedBeds ?? 0), icon: Bed, href: "/houses" },
    { label: "Chore Reviews", value: pendingChoreReviews ?? 0, icon: ClipboardCheck, href: "/chores" },
    { label: "Leave Requests", value: pendingLeaveRequests ?? 0, icon: CalendarClock, href: "/leave-requests" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user.full_name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.label}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

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
                      {new Date(entry.created_at).toLocaleString()}
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
    </div>
  );
}

async function ResidentDashboard({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("*, bed_assignments(*, bed:beds(*, room:rooms(*)))")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  // Get current rotation assignments for this resident
  const { data: myRotationAssignments } = await supabase
    .from("chore_rotation_assignments")
    .select("*, chore:chores(name), rotation:chore_rotations(cycle_start_date, cycle_end_date, is_current), chore_signoffs(*)")
    .eq("resident_id", resident?.id ?? "")
    .limit(10);

  const { data: myLeaveRequests } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("resident_id", resident?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!resident) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          No resident profile found. Please contact your house manager.
        </p>
      </div>
    );
  }

  const activeBeds = resident.bed_assignments?.filter(
    (ba: { end_date: string | null }) => !ba.end_date
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome, {resident.full_name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">My Room</CardTitle>
          </CardHeader>
          <CardContent>
            {activeBeds && activeBeds.length > 0 ? (
              <div>
                {activeBeds.map((ba: { id: string; bed: { label: string; room: { name: string } } }) => (
                  <p key={ba.id} className="text-lg font-semibold">
                    {ba.bed.room.name} — {ba.bed.label}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No bed assigned</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Sobriety
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resident.sobriety_date ? (
              <div>
                <p className="text-2xl font-bold">
                  {getDaysSober(resident.sobriety_date)} days
                </p>
                <p className="text-xs text-muted-foreground">
                  Since {new Date(resident.sobriety_date).toLocaleDateString()}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Not set</p>
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
          {myRotationAssignments && myRotationAssignments.length > 0 ? (
            <div className="space-y-2">
              {myRotationAssignments
                .filter((ra) => (ra.rotation as { is_current: boolean })?.is_current)
                .map((ra) => {
                  const signoffs = (ra.chore_signoffs as Array<{ status: string }>) ?? [];
                  const pending = signoffs.filter((s) => s.status === "pending").length;
                  const approved = signoffs.filter((s) => s.status === "approved").length;
                  return (
                    <div
                      key={ra.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div>
                        <p className="font-medium">{(ra.chore as unknown as { name: string } | null)?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {approved}/{signoffs.length} completed · {pending} pending
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
            <p className="text-sm text-muted-foreground">No chores assigned this cycle</p>
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
                      {new Date(lr.departure_date).toLocaleDateString()} —{" "}
                      {new Date(lr.expected_return_date).toLocaleDateString()}
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
    default:
      return <Activity className={iconClass} />;
  }
}
