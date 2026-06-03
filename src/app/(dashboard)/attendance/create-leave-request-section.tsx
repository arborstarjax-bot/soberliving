import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import { CreateLeaveRequestDialog } from "../leave-requests/create-leave-request-dialog";

export async function CreateLeaveRequestSection({ user }: { user: SessionUser }) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let userResidentId: string | undefined;
  if (user.role === "resident" || user.is_resident) {
    const { data: myResident } = await supabase
      .from("residents")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    userResidentId = myResident?.id;
  }

  let residentsQuery = supabase
    .from("residents")
    .select("id, full_name, house_id")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);
  const { data: residents } = await residentsQuery;

  return (
    <CreateLeaveRequestDialog
      residents={residents ?? []}
      userRole={user.role}
      userId={user.id}
      userResidentId={userResidentId}
    />
  );
}
