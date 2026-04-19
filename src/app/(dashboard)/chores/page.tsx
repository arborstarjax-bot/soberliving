import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getCachedActiveHouses } from "@/lib/cached-dropdowns";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { ListSkeleton } from "@/components/ui/skeleton";
import type { SessionUser } from "@/lib/types";
import { CreateChoreDialog } from "./create-chore-dialog";
import { StartRotationDialog } from "./start-rotation-dialog";
import { ChoresBodySection } from "./chores-body-section";

/**
 * Chores shell. Title + staff action buttons paint immediately.
 * The heavy rotation / chore-list / signoff data gather is
 * deferred behind `<Suspense>`.
 */
export default async function ChoresPage() {
  const user = await requireAuth();
  const isStaff = user.role === "admin" || user.role === "manager";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chores</h1>
          <p className="text-muted-foreground">
            Chore rotation · Current week view
          </p>
        </div>
        {isStaff && (
          <Suspense fallback={null}>
            <StaffActions user={user} />
          </Suspense>
        )}
      </div>

      <Suspense fallback={<ListSkeleton rows={4} rowClassName="h-32 w-full" />}>
        <ChoresBodySection user={user} />
      </Suspense>
    </div>
  );
}

async function StaffActions({ user }: { user: SessionUser }) {
  const houseFilter = getAccessibleHouseFilter(user);
  const all = await getCachedActiveHouses();
  const houses = houseFilter
    ? all.filter((h) => houseFilter.includes(h.id))
    : all;

  return (
    <div className="flex gap-2">
      <CreateChoreDialog houses={houses} />
      <StartRotationDialog houses={houses} />
    </div>
  );
}
