import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedActiveHouses } from "@/lib/cached-dropdowns";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { ListSkeleton } from "@/components/ui/skeleton";
import type { SessionUser } from "@/lib/types";
import { CreateChoreDialog } from "./create-chore-dialog";
import { StartRotationDialog } from "./start-rotation-dialog";
import { ChoresBodySection } from "./chores-body-section";
import { HouseFilterTabs } from "./house-filter-tabs";

/**
 * Chores shell. Title + staff action buttons paint immediately.
 * The heavy rotation / chore-list / signoff data gather is
 * deferred behind `<Suspense>`.
 *
 * Staff can narrow the entire page to one of their accessible houses
 * via the `?house=<id>` query param. Admins see every active house;
 * managers see only their assigned set. Residents don't get the tabs.
 */
interface ChoresPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ChoresPage({ searchParams }: ChoresPageProps) {
  const user = await requireAuth();
  const isStaff = user.role === "admin" || user.role === "manager";

  const sp = await searchParams;
  const rawHouse = sp.house;
  const requestedHouseId =
    typeof rawHouse === "string" && rawHouse.length > 0 ? rawHouse : null;

  // Resolve the authoritative accessible-house list server-side so a
  // resident URL-guessing `?house=...` can't leak another house's
  // data. `selectedHouseId` is null when "All Houses" is active or
  // the provided id is outside the user's accessible set.
  const houseFilter = isStaff ? getAccessibleHouseFilter(user) : null;
  const allHouses = isStaff ? await getCachedActiveHouses() : [];
  const accessibleHouses = houseFilter
    ? allHouses.filter((h) => houseFilter.includes(h.id))
    : allHouses;
  const selectedHouseId =
    isStaff &&
    requestedHouseId &&
    accessibleHouses.some((h) => h.id === requestedHouseId)
      ? requestedHouseId
      : null;

  // Rooms for the Create-Chore dialog's "Excluded Rooms" picker.
  // Scoped to the user's accessible houses so a manager never sees
  // another house's rooms in the dropdown.
  const accessibleHouseIds = accessibleHouses.map((h) => h.id);
  const rooms = isStaff && accessibleHouseIds.length > 0 ? await fetchRooms(accessibleHouseIds) : [];

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
          <StaffActions
            user={user}
            houses={accessibleHouses}
            rooms={rooms}
            defaultHouseId={selectedHouseId}
          />
        )}
      </div>

      {isStaff && (
        <HouseFilterTabs
          houses={accessibleHouses}
          selectedHouseId={selectedHouseId}
        />
      )}

      <Suspense fallback={<ListSkeleton rows={4} rowClassName="h-32 w-full" />}>
        <ChoresBodySection
          user={user}
          selectedHouseId={selectedHouseId}
        />
      </Suspense>
    </div>
  );
}

async function fetchRooms(houseIds: string[]) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rooms")
    .select("id, house_id, name")
    .eq("is_active", true)
    .in("house_id", houseIds)
    .order("name");
  return data ?? [];
}

function StaffActions({
  user: _user,
  houses,
  rooms,
  defaultHouseId,
}: {
  user: SessionUser;
  houses: { id: string; name: string }[];
  rooms: { id: string; house_id: string; name: string }[];
  defaultHouseId: string | null;
}) {
  return (
    <div className="flex gap-2">
      <CreateChoreDialog
        houses={houses}
        rooms={rooms}
        defaultHouseId={defaultHouseId}
      />
      <StartRotationDialog houses={houses} defaultHouseId={defaultHouseId} />
    </div>
  );
}
