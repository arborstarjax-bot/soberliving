import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { ResidentBottomNav } from "@/components/resident-bottom-nav";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getWorkspace, getWorkspaceSettings } from "@/lib/workspace";
import { NotificationBadge } from "./notification-badge";
import { BulletinBadge } from "./bulletin-badge";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Discharged residents are locked out of the app entirely. Their
  // login and documents survive for potential return, but no route
  // inside (dashboard) is reachable until staff reactivates them.
  if (user.role === "resident" && user.resident_discharged) {
    redirect("/discharged");
  }

  // --- Single parallel fan-out ---
  // Previously the layout awaited workspace settings, then check-in,
  // then leave-restriction, then workspace name sequentially — 4 round-
  // trips (~400ms). Now everything fires in one Promise.all (~100ms).
  const adminClient = createAdminClient();

  const [wsSettings, ws, pendingCheckInRes, hasNoLeaveRestriction] =
    await Promise.all([
      user.workspace_id
        ? getWorkspaceSettings(user.workspace_id)
        : Promise.resolve(null),
      user.workspace_id
        ? getWorkspace(user.workspace_id)
        : Promise.resolve(null),
      adminClient
        .from("check_in_responses")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle(),
      user.role === "resident"
        ? (async () => {
            const supabase = await createClient();
            const { data } = await supabase
              .from("restrictions")
              .select("id, residents!inner(user_id)")
              .eq("residents.user_id", user.id)
              .eq("residents.status", "active")
              .eq("is_active", true)
              .in("restriction_type", [
                "no_leave",
                "no_overnight",
                "house_commitment",
              ])
              .limit(1)
              .maybeSingle();
            return !!data;
          })()
        : Promise.resolve(false),
    ]);

  const commitmentRequired = wsSettings?.require_commitment !== false;
  const paymentsEnabled = wsSettings?.enable_payments !== false;
  const workspaceName = ws?.name ?? "Sober Living";

  // --- Redirect gates (evaluated after the single fan-out) ---

  // Resident who hasn't completed intake.
  if (user.role === "resident" && !user.intake_completed) {
    if (wsSettings && !wsSettings.require_application) {
      redirect("/quick-signup");
    }
    redirect("/intake");
  }

  // Any resident (including admins/managers who are also residents) who
  // hasn't acknowledged house rules after completing intake.
  if (user.is_resident && !user.rules_acknowledged) {
    redirect("/rules");
  }

  // Pending workspace members: submitted intake but awaiting admin approval.
  if (
    user.role === "resident" &&
    user.intake_completed &&
    user.workspace_member_status === "pending"
  ) {
    redirect("/pending-approval");
  }

  // Unsigned commitment agreement (skip when workspace doesn't require it).
  if (user.role === "resident" && user.intake_completed && !user.commitment_signed && commitmentRequired) {
    redirect("/sign-commitment");
  }

  // Pending amendment awaiting resident signature.
  if (user.role === "resident" && user.has_pending_commitment && commitmentRequired) {
    redirect("/sign-commitment");
  }

  // Outstanding blocker requiring acknowledgment.
  if (user.role === "resident" && user.pending_blocker_id) {
    redirect(`/acknowledge/${user.pending_blocker_id}`);
  }

  // Pending check-in response.
  if (pendingCheckInRes.data) {
    redirect(`/check-in/${pendingCheckInRes.data.id}`);
  }

  const isResident = user.role === "resident";

  const notificationBadge = (
    <Suspense fallback={null}>
      <NotificationBadge userId={user.id} />
    </Suspense>
  );

  const bulletinBadge = (
    <Suspense fallback={null}>
      <BulletinBadge
        userId={user.id}
        userRole={user.role}
        assignedHouseIds={user.assigned_house_ids}
        workspaceId={user.workspace_id}
      />
    </Suspense>
  );

  if (isResident) {
    return (
      <div className="flex flex-col lg:flex-row h-dvh overflow-hidden">
        {/* Desktop: sidebar. Mobile: bottom nav replaces it. */}
        <Sidebar
          role={user.role}
          userName={user.full_name}
          workspaceName={workspaceName}
          hasNoLeaveRestriction={hasNoLeaveRestriction}
          enablePayments={paymentsEnabled}
          notificationBadge={notificationBadge}
          bulletinBadge={bulletinBadge}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
          <div className="animate-page-enter container mx-auto p-4 lg:p-6 max-w-2xl lg:max-w-7xl pt-[max(1rem,env(safe-area-inset-top))] pb-[max(5rem,calc(4rem+env(safe-area-inset-bottom)))] lg:pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
            {children}
          </div>
        </main>
        <ResidentBottomNav
          hasNoLeaveRestriction={hasNoLeaveRestriction}
          bulletinBadge={bulletinBadge}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-dvh overflow-hidden">
      <Sidebar
        role={user.role}
        userName={user.full_name}
        workspaceName={workspaceName}
        hasNoLeaveRestriction={hasNoLeaveRestriction}
        enablePayments={paymentsEnabled}
        notificationBadge={notificationBadge}
        bulletinBadge={bulletinBadge}
      />
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        <div className="animate-page-enter container mx-auto p-4 lg:p-6 max-w-7xl pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:pt-[max(1.5rem,env(safe-area-inset-top))] lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </main>
    </div>
  );
}
