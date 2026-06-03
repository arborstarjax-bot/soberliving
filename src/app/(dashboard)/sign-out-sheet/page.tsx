import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { ListSkeleton } from "@/components/ui/skeleton";
import { redirect } from "next/navigation";
import { CurrentlyOutSection } from "./currently-out-section";
import { SignOutHistorySection } from "./history-section";
import { SignOutHistoryFilterBarSection } from "./filter-bar-section";
import { SignOutTabs } from "./sign-out-tabs";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Staff-only sign-out sheet. The shell (title + filter bar
 * placeholder + two card placeholders) paints immediately;
 * every data-backed section streams in behind its own Suspense
 * boundary so one slow query doesn't block the rest.
 */
export default async function SignOutSheetPage({ searchParams }: PageProps) {
  const user = await requireAuth();
  // Residents sign in/out from their dashboard toggle and don't
  // get a roster of who else is out; bounce them back.
  if (user.role === "resident") {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const activeTab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) || "all";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sign Out Sheet</h1>
        <p className="text-sm text-muted-foreground">
          Who&apos;s currently out and recent sign-out history.
        </p>
      </div>

      <SignOutTabs activeTab={activeTab} />

      <Suspense
        fallback={
          <div className="h-16 rounded-lg border bg-muted/30 animate-pulse" />
        }
      >
        <SignOutHistoryFilterBarSection user={user} />
      </Suspense>

      {activeTab === "all" && (
        <Suspense fallback={<ListSkeleton rows={3} />}>
          <CurrentlyOutSection user={user} />
        </Suspense>
      )}

      <Suspense fallback={<ListSkeleton rows={5} />}>
        <SignOutHistorySection user={user} searchParams={sp} pastCurfewOnly={activeTab === "past_curfew"} />
      </Suspense>
    </div>
  );
}
