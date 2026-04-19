import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, Users, Bed, ClipboardCheck, DollarSign, CalendarClock } from "lucide-react";
import { ResidentDashboardSection } from "./resident-dashboard-section";
import {
  HousesStatTile,
  ActiveResidentsStatTile,
  OpenBedsStatTile,
  ChoreReviewsStatTile,
  PendingPaymentsStatTile,
  LeaveRequestsStatTile,
  StatTileFallback,
  RecentActivitySection,
  RecentActivityFallback,
} from "./stat-tiles";

/**
 * Dashboard shell. Header + welcome line render immediately. The
 * resident dashboard body and the staff fallback stat tiles are
 * each behind `<Suspense>` so the page never blocks on a slow
 * query.
 *
 * Admins and managers redirect to `/admin` — this page only ever
 * renders for residents or role-less auth edge cases.
 */
export default async function DashboardPage() {
  const user = await requireAuth();

  if (user.role === "admin" || user.role === "manager") {
    redirect("/admin");
  }

  if (user.role === "resident") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Dashboard</h1>
          <p className="text-muted-foreground">Welcome, {user.full_name}</p>
        </div>
        <Suspense fallback={<ResidentDashboardSkeleton />}>
          <ResidentDashboardSection userId={user.id} />
        </Suspense>
      </div>
    );
  }

  const houseFilter = getAccessibleHouseFilter(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user.full_name}
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Suspense
          fallback={<StatTileFallback label="Houses" icon={Home} href="/houses" />}
        >
          <HousesStatTile houseFilter={houseFilter} />
        </Suspense>
        <Suspense
          fallback={
            <StatTileFallback
              label="Active Residents"
              icon={Users}
              href="/residents"
            />
          }
        >
          <ActiveResidentsStatTile houseFilter={houseFilter} />
        </Suspense>
        <Suspense
          fallback={<StatTileFallback label="Open Beds" icon={Bed} href="/houses" />}
        >
          <OpenBedsStatTile houseFilter={houseFilter} />
        </Suspense>
        <Suspense
          fallback={
            <StatTileFallback
              label="Chore Reviews"
              icon={ClipboardCheck}
              href="/chores"
            />
          }
        >
          <ChoreReviewsStatTile houseFilter={houseFilter} />
        </Suspense>
        <Suspense
          fallback={
            <StatTileFallback
              label="Pending Payments"
              icon={DollarSign}
              href="/payments"
            />
          }
        >
          <PendingPaymentsStatTile houseFilter={houseFilter} />
        </Suspense>
        <Suspense
          fallback={
            <StatTileFallback
              label="Leave Requests"
              icon={CalendarClock}
              href="/leave-requests"
            />
          }
        >
          <LeaveRequestsStatTile houseFilter={houseFilter} />
        </Suspense>
      </div>

      <Suspense fallback={<RecentActivityFallback />}>
        <RecentActivitySection houseFilter={houseFilter} />
      </Suspense>
    </div>
  );
}

function ResidentDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
