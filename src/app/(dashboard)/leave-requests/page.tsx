import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { ListSkeleton } from "@/components/ui/skeleton";
import type { SessionUser } from "@/lib/types";
import { CreateLeaveRequestDialog } from "./create-leave-request-dialog";
import { LeaveRequestsTabsSection } from "./leave-requests-tabs-section";

/**
 * Overnight Requests shell. Title + Create dialog render
 * immediately. The tabbed list (with its joined cover / manager /
 * admin data) is deferred behind `<Suspense>`.
 */
export default async function LeaveRequestsPage() {
  const user = await requireAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overnight Requests</h1>
          <p className="text-muted-foreground">Multi-step approval</p>
        </div>
        <Suspense fallback={null}>
          <CreateDialogSection user={user} />
        </Suspense>
      </div>

      <Suspense fallback={<ListSkeleton rows={5} rowClassName="h-28 w-full" />}>
        <LeaveRequestsTabsSection user={user} />
      </Suspense>
    </div>
  );
}

async function CreateDialogSection({ user }: { user: SessionUser }) {
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
