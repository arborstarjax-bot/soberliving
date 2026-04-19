import { createClient } from "@/lib/supabase/server";
import { OccupancyGrid } from "./occupancy-grid";
import { AddRoomDialog } from "./add-room-dialog";
import type { UserRole } from "@/lib/types";

/**
 * Occupancy tab body — rooms + beds + bed_assignments + residents
 * (deep join). Only mounted when `tab=occupancy` so the join
 * doesn't run on any other tab view.
 */
export async function OccupancySection({
  houseId,
  userRole,
}: {
  houseId: string;
  userRole: UserRole;
}) {
  const supabase = await createClient();

  const [{ data: rooms }, { data: residents }] = await Promise.all([
    supabase
      .from("rooms")
      .select(
        "*, beds(*, bed_assignments(*, resident:residents(id, full_name, status)))"
      )
      .eq("house_id", houseId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("residents")
      .select("id, full_name, status, move_in_date, sobriety_date")
      .eq("house_id", houseId)
      .eq("status", "active")
      .order("full_name"),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddRoomDialog houseId={houseId} />
      </div>
      <OccupancyGrid
        rooms={rooms ?? []}
        houseId={houseId}
        residents={residents ?? []}
        userRole={userRole}
      />
    </div>
  );
}
