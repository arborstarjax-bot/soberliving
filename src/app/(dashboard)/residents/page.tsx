import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { ListSkeleton } from "@/components/ui/skeleton";
import { CreateUserDialog } from "../users/create-user-dialog";
import { ResidentsTabsSection } from "./residents-tabs-section";

/**
 * Residents page shell. Header, active-count badge, and Create User
 * dialog render immediately. The four-tab data gather (residents +
 * staff + intake funnel + check-ins) is deferred behind a
 * `<Suspense>` boundary so the page feels instant even when one of
 * those joins is slow.
 *
 * We still run a tiny `count`-only query at the top of the page to
 * render "{N} active residents" without waiting for the full tabs
 * payload — that lookup is an index-only scan and returns in
 * single-digit ms.
 */
export default async function ResidentsPage() {
  const user = await requireAuth();
  const isStaff = user.role === "admin" || user.role === "manager";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Residents</h1>
          <Suspense
            fallback={
              <p className="text-muted-foreground">&nbsp;</p>
            }
          >
            <ActiveCountLine user={user} />
          </Suspense>
        </div>
        {isStaff && (
          <Suspense fallback={null}>
            <CreateUserDialogSection user={user} />
          </Suspense>
        )}
      </div>

      <Suspense
        fallback={<ListSkeleton rows={6} rowClassName="h-20 w-full" />}
      >
        <ResidentsTabsSection user={user} />
      </Suspense>
    </div>
  );
}

async function ActiveCountLine({
  user,
}: {
  user: Awaited<ReturnType<typeof requireAuth>>;
}) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  let q = supabase
    .from("residents")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if (houseFilter) q = q.in("house_id", houseFilter);
  const { count } = await q;
  return (
    <p className="text-muted-foreground">{count ?? 0} active residents</p>
  );
}

async function CreateUserDialogSection({
  user,
}: {
  user: Awaited<ReturnType<typeof requireAuth>>;
}) {
  // The Create User dialog needs the list of houses for its house
  // dropdown. Fetch only what the dialog needs — much lighter than
  // the full ResidentsTabs payload.
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  let q = supabase
    .from("houses")
    .select("id, name, address")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) q = q.in("id", houseFilter);
  const { data: houses } = await q;
  return <CreateUserDialog houses={houses ?? []} />;
}
