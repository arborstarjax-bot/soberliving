import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { ResidentBottomNav } from "@/components/resident-bottom-nav";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getWorkspaceSettings } from "@/lib/workspace";
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

  // Redirect resident-role users who haven't completed intake.
  // Route to quick-signup when the workspace doesn't require application.
  if (user.role === "resident" && !user.intake_completed) {
    if (user.workspace_id) {
      const wsSettings = await getWorkspaceSettings(user.workspace_id);
      if (wsSettings && !wsSettings.require_application) {
        redirect("/quick-signup");
      }
    }
    redirect("/intake");
  }

  // Gate pending workspace members after intake: they've submitted their
  // application/registration but still need admin approval before proceeding.
  if (
    user.role === "resident" &&
    user.intake_completed &&
    user.workspace_member_status === "pending"
  ) {
    redirect("/pending-approval");
  }

  // Check whether the workspace requires commitment agreements.
  // Used by both the initial commitment gate and the pending-amendment gate.
  let commitmentRequired = true;
  if (user.workspace_id) {
    const wsSettings = await getWorkspaceSettings(user.workspace_id);
    if (wsSettings && !wsSettings.require_commitment) {
      commitmentRequired = false;
    }
  }

  // Redirect residents who completed intake but haven't signed their commitment agreement.
  // Skip if the workspace doesn't require commitment.
  if (user.role === "resident" && user.intake_completed && !user.commitment_signed && commitmentRequired) {
    redirect("/sign-commitment");
  }

  // Redirect residents who have a pending amendment awaiting
  // their signature. commitment_signed stays true on the user row
  // after the original commitment is signed, so without this check
  // a resident whose admin just proposed a rent-change amendment
  // could keep using the app and never see the updated agreement.
  // requireAuth computes has_pending_commitment via a live query
  // against house_commitments, so this is always source-of-truth.
  // Skip when workspace doesn't require commitments.
  if (user.role === "resident" && user.has_pending_commitment && commitmentRequired) {
    redirect("/sign-commitment");
  }

  // Redirect residents with an outstanding blocker they haven't
  // acknowledged yet. Blockers are admin/manager-authored messages
  // that require a signed ack before the resident can proceed —
  // same gating model as /sign-commitment. pending_blocker_id is
  // FIFO (oldest-first) so multi-blocker scenarios resolve in order.
  // getSessionUser re-verifies the candidate before exposing it, so
  // if this field is truthy the blocker is guaranteed to still be
  // pending (not archived, not already acked). See src/lib/auth.ts.
  if (user.role === "resident" && user.pending_blocker_id) {
    redirect(`/acknowledge/${user.pending_blocker_id}`);
  }

  // Critical-path queries that can influence the rendered shell:
  //   • pendingCheckIn can redirect the request entirely
  //   • hasNoLeaveRestriction controls whether the Overnight Request
  //     nav link is filtered out (must be known before the sidebar
  //     renders, otherwise the link would flash in then disappear)
  //
  // Run them in parallel — previously this was two sequential
  // awaits which added a full round-trip on every resident
  // navigation. The unread-count work has moved into Suspense
  // islands (NotificationBadge / BulletinBadge) so it no longer
  // blocks the shell at all.
  const adminClient = createAdminClient();

  const pendingCheckInPromise = adminClient
    .from("check_in_responses")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  const noLeavePromise =
    user.role === "resident"
      ? (async () => {
          const supabase = await createClient();
          const { data: myResident } = await supabase
            .from("residents")
            .select("id")
            .eq("user_id", user.id)
            .eq("status", "active")
            .maybeSingle();
          if (!myResident) return false;
          const { data: noLeave } = await supabase
            .from("restrictions")
            .select("id")
            .eq("resident_id", myResident.id)
            .eq("is_active", true)
            .in("restriction_type", [
              "no_leave",
              "no_overnight",
              "house_commitment",
            ])
            .limit(1)
            .maybeSingle();
          return !!noLeave;
        })()
      : Promise.resolve(false);

  const [pendingCheckInRes, hasNoLeaveRestriction] = await Promise.all([
    pendingCheckInPromise,
    noLeavePromise,
  ]);

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
          hasNoLeaveRestriction={hasNoLeaveRestriction}
          notificationBadge={notificationBadge}
          bulletinBadge={bulletinBadge}
        />
        <main className="flex-1 overflow-y-auto min-w-0">
          <div className="container mx-auto p-4 lg:p-6 max-w-2xl lg:max-w-7xl pt-[max(1rem,env(safe-area-inset-top))] pb-[max(5rem,calc(4rem+env(safe-area-inset-bottom)))] lg:pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
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
        hasNoLeaveRestriction={hasNoLeaveRestriction}
        notificationBadge={notificationBadge}
        bulletinBadge={bulletinBadge}
      />
      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="container mx-auto p-4 lg:p-6 max-w-7xl pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:pt-[max(1.5rem,env(safe-area-inset-top))] lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </main>
    </div>
  );
}
