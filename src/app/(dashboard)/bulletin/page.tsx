import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/server";
import { BulletinFeedSection } from "./bulletin-feed-section";
import { NewPostSection } from "./new-post-section";
import { BulletinSideEffects } from "./bulletin-side-effects";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { RefreshOnMount } from "@/components/refresh-on-mount";
import { NewGrievanceForm } from "../report/new-grievance-form";

interface BulletinPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BulletinPage({ searchParams }: BulletinPageProps) {
  const user = await requireAuth();
  const params = await searchParams;

  // Resolve the visible-house scope for the feed. Residents need a
  // live residents lookup (same filter the sidebar unread count
  // uses); managers use their cached assigned_house_ids; admins see
  // everything. Kept in the shell because it's one indexed lookup
  // at most and the feed Suspense key needs it.
  const houseFilter = getAccessibleHouseFilter(user);
  let visibleHouseIds: string[] | null = null; // null = all
  if (user.role === "admin") {
    visibleHouseIds = houseFilter;
  } else if (user.role === "resident") {
    const supabase = createAdminClient();
    const { data: resident } = await supabase
      .from("residents")
      .select("house_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    visibleHouseIds = resident?.house_id
      ? [resident.house_id as string]
      : [];
  } else if (user.role === "manager") {
    visibleHouseIds = houseFilter && houseFilter.length > 0 ? houseFilter : [];
  }

  // Suspense key: any change to cursor / filters should reset the
  // fallback skeleton instead of reusing a stale one. React uses
  // this to decide whether the next render can reuse the current
  // children.
  const suspenseKey = `c=${(Array.isArray(params.c) ? params.c[0] : params.c) ?? ""}&cp=${
    (Array.isArray(params.cp) ? params.cp[0] : params.cp) ?? ""
  }`;

  const showReport = (Array.isArray(params.report) ? params.report[0] : params.report) === "1";

  return (
    <div className="space-y-6">
      <RefreshOnMount />

      {/* Fire-and-forget side effects (unread-badge bump, milestone
          auto-posts) — wrapped in Suspense with null fallback so the
          shell streams without waiting on them. */}
      <Suspense fallback={null}>
        <BulletinSideEffects userId={user.id} />
      </Suspense>

      {!showReport && (
        <>
          {/* NewPostForm needs a role-dependent houses lookup — defer it
              so it doesn't block the feed from streaming. */}
          <Suspense fallback={<Skeleton className="h-20 w-full" />}>
            <NewPostSection
              userId={user.id}
              userRole={user.role}
              assignedHouseIds={user.assigned_house_ids ?? []}
              workspaceId={user.workspace_id}
            />
          </Suspense>

          <Suspense
            key={suspenseKey}
            fallback={<ListSkeleton rows={6} rowClassName="h-32 w-full" />}
          >
            <BulletinFeedSection
              currentUserId={user.id}
              currentUserRole={user.role}
              visibleHouseIds={visibleHouseIds}
              searchParams={params}
            />
          </Suspense>
        </>
      )}

      {showReport && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            File a grievance or report a problem. Check
            &quot;Submit anonymously&quot; to send the report without your
            name or house attached.
          </p>
          <NewGrievanceForm />
        </div>
      )}
    </div>
  );
}
