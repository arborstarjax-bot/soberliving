import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { ListSkeleton } from "@/components/ui/skeleton";
import { redirect } from "next/navigation";
import { AttendanceTabs } from "./attendance-tabs";
import { CurrentlyOutSection } from "../sign-out-sheet/currently-out-section";
import { SignOutHistorySection } from "../sign-out-sheet/history-section";
import { SignOutHistoryFilterBarSection } from "../sign-out-sheet/filter-bar-section";
import { LeaveRequestsTabsSection } from "../leave-requests/leave-requests-tabs-section";
import { CreateLeaveRequestSection } from "./create-leave-request-section";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Unified Attendance hub — merges the Sign Out Sheet and Overnight
 * Requests into a single page with tabs:
 *   Currently Out | Past Curfew | Overnight Requests | History
 *
 * Staff see all tabs. Residents see only Overnight Requests (their
 * own sign-in/out is on the dashboard toggle).
 */
export default async function AttendancePage({ searchParams }: PageProps) {
  const user = await requireAuth();
  const isStaff = user.role === "admin" || user.role === "manager";

  const sp = await searchParams;
  const activeTab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) || (isStaff ? "currently_out" : "overnight");

  // Residents only see overnight requests
  if (!isStaff && activeTab !== "overnight") {
    redirect("/attendance?tab=overnight");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            {isStaff
              ? "Sign-outs, curfew tracking, and overnight requests."
              : "Submit and track overnight requests."}
          </p>
        </div>
        {activeTab === "overnight" && (
          <Suspense fallback={null}>
            <CreateLeaveRequestSection user={user} />
          </Suspense>
        )}
      </div>

      <AttendanceTabs activeTab={activeTab} isStaff={isStaff} />

      {/* Currently Out tab (staff only) */}
      {isStaff && activeTab === "currently_out" && (
        <>
          <Suspense
            fallback={
              <div className="h-16 rounded-lg border bg-muted/30 animate-pulse" />
            }
          >
            <SignOutHistoryFilterBarSection user={user} />
          </Suspense>
          <Suspense fallback={<ListSkeleton rows={3} />}>
            <CurrentlyOutSection user={user} />
          </Suspense>
          <Suspense fallback={<ListSkeleton rows={5} />}>
            <SignOutHistorySection user={user} searchParams={sp} pastCurfewOnly={false} />
          </Suspense>
        </>
      )}

      {/* Past Curfew tab (staff only) */}
      {isStaff && activeTab === "past_curfew" && (
        <>
          <Suspense
            fallback={
              <div className="h-16 rounded-lg border bg-muted/30 animate-pulse" />
            }
          >
            <SignOutHistoryFilterBarSection user={user} />
          </Suspense>
          <Suspense fallback={<ListSkeleton rows={5} />}>
            <SignOutHistorySection user={user} searchParams={sp} pastCurfewOnly={true} />
          </Suspense>
        </>
      )}

      {/* Overnight Requests tab */}
      {activeTab === "overnight" && (
        <Suspense fallback={<ListSkeleton rows={5} rowClassName="h-28 w-full" />}>
          <LeaveRequestsTabsSection user={user} />
        </Suspense>
      )}
    </div>
  );
}
