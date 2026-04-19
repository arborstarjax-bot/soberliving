import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let housesQuery = supabase
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) housesQuery = housesQuery.in("id", houseFilter);
  const { data: houses } = await housesQuery;

  return (
    <div className="flex gap-2">
      <CreateChoreDialog houses={houses ?? []} />
      <StartRotationDialog houses={houses ?? []} />
    </div>
  );
}
