import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import { CreateLeaveRequestDialog } from "../leave-requests/create-leave-request-dialog";

export async function CreateLeaveRequestSection({ user }: { user: SessionUser }) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let userResidentId: string | undefined;
  let userHouseId: string | undefined;
  if (user.role === "resident" || user.is_resident) {
    const { data: myResident } = await supabase
      .from("residents")
      .select("id, house_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    userResidentId = myResident?.id;
    // Only true residents get house-scoped pickers — staff who also have
    // a resident record keep their staff-wide resident list.
    if (user.role === "resident") {
      userHouseId = myResident?.house_id ?? undefined;
    }
  }

  // Resident-role RLS only returns the resident's own row, but the form
  // legitimately needs same-house housemates as cover candidates — use
  // the admin client for those lookups when scoped to a resident's house.
  const residentsDb = userHouseId ? createAdminClient() : supabase;

  let residentsQuery = residentsDb
    .from("residents")
    .select("id, full_name, house_id")
    .eq("status", "active")
    .order("full_name");
  if (userHouseId) {
    // Residents can only pick themselves + same-house covering residents.
    residentsQuery = residentsQuery.eq("house_id", userHouseId);
  } else if (houseFilter) {
    residentsQuery = residentsQuery.in("house_id", houseFilter);
  }
  const { data: residents } = await residentsQuery;

  // Residents already carrying chore assignments in their house's current
  // rotation can't be picked as covering residents — they'd be covering
  // someone else's chores while doing their own.
  let rotationQuery = residentsDb
    .from("chore_rotations")
    .select("id")
    .eq("is_current", true);
  if (userHouseId) {
    rotationQuery = rotationQuery.eq("house_id", userHouseId);
  } else if (houseFilter) {
    rotationQuery = rotationQuery.in("house_id", houseFilter);
  }
  const { data: rotations } = await rotationQuery;

  const rotationIds = (rotations ?? []).map((r) => r.id);
  const busyResidentIds = new Set<string>();
  if (rotationIds.length > 0) {
    const { data: assignments } = await supabase
      .from("chore_rotation_assignments")
      .select("resident_id")
      .in("rotation_id", rotationIds);
    for (const a of assignments ?? []) busyResidentIds.add(a.resident_id);
  }

  return (
    <CreateLeaveRequestDialog
      residents={residents ?? []}
      busyResidentIds={[...busyResidentIds]}
      userRole={user.role}
      userId={user.id}
      userResidentId={userResidentId}
    />
  );
}
