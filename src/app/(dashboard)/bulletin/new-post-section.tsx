import { createAdminClient } from "@/lib/supabase/server";
import { getCachedActiveHouses } from "@/lib/cached-dropdowns";
import type { UserRole } from "@/lib/types";
import { NewPostForm } from "./new-post-form";

/**
 * Async island that resolves the list of houses the current user can
 * post to, then renders the NewPostForm. Deferred so the bulletin
 * page shell paints without waiting on this lookup.
 */
export async function NewPostSection({
  userId,
  userRole,
  assignedHouseIds,
}: {
  userId: string;
  userRole: UserRole;
  assignedHouseIds: string[];
}) {
  let postableHouses: { id: string; name: string }[] = [];
  if (userRole === "admin") {
    postableHouses = await getCachedActiveHouses();
  } else if (userRole === "manager") {
    if (assignedHouseIds.length > 0) {
      const assignedSet = new Set(assignedHouseIds);
      const all = await getCachedActiveHouses();
      postableHouses = all.filter((h) => assignedSet.has(h.id));
    }
  } else {
    const supabase = createAdminClient();
    const { data: resident } = await supabase
      .from("residents")
      .select("house_id, house:houses!inner(id, name)")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (resident) {
      const house = resident.house as unknown as { id: string; name: string };
      postableHouses = [{ id: house.id, name: house.name }];
    }
  }

  return (
    <NewPostForm
      houses={postableHouses}
      userRole={userRole}
      singleHouse={userRole === "resident" && postableHouses.length === 1}
    />
  );
}
