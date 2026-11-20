import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getWorkspaceSettings } from "@/lib/workspace";
import { isModuleEnabled } from "@/lib/modules";
import { ListSkeleton } from "@/components/ui/skeleton";
import { LeaveRequestsTabsSection } from "../leave-requests/leave-requests-tabs-section";

/**
 * Passes hub — pending, approved and past overnight passes. Residents
 * see their own requests (plus any they're covering); staff see every
 * pass for their houses. Lives outside Attendance so both roles get a
 * dedicated printable-pass view per request.
 */
export default async function PassesPage() {
  const user = await requireAuth();
  const wsSettings = user.workspace_id
    ? await getWorkspaceSettings(user.workspace_id)
    : null;
  if (!isModuleEnabled(wsSettings, "attendance")) redirect("/dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Passes</h1>
        <p className="text-muted-foreground">
          Overnight passes — pending, approved, and past. Select
          &quot;Print pass&quot; on any request for a printable copy.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <LeaveRequestsTabsSection
          user={user}
          passApprover={wsSettings?.pass_approver ?? "both"}
        />
      </Suspense>
    </div>
  );
}
