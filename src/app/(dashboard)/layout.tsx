import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { createAdminClient, createClient } from "@/lib/supabase/server";
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

  // Redirect resident-role users who haven't completed intake
  // Only applies to role=resident, NOT admins/managers who are also marked as residents
  if (user.role === "resident" && !user.intake_completed) {
    redirect("/intake");
  }

  // Redirect residents who completed intake but haven't signed their commitment agreement
  if (user.role === "resident" && user.intake_completed && !user.commitment_signed) {
    redirect("/sign-commitment");
  }

  // Redirect residents who have a pending amendment awaiting
  // their signature. commitment_signed stays true on the user row
  // after the original commitment is signed, so without this check
  // a resident whose admin just proposed a rent-change amendment
  // could keep using the app and never see the updated agreement.
  // requireAuth computes has_pending_commitment via a live query
  // against house_commitments, so this is always source-of-truth.
  if (user.role === "resident" && user.has_pending_commitment) {
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

  return (
    // h-dvh (dynamic viewport height) instead of h-screen so the shell
    // tracks mobile browser chrome (address bar collapse, keyboard
    // open). 100vh on iOS Safari is locked to the tallest possible
    // height which makes the bottom of the app hide behind the URL bar.
    //
    // flex-col on mobile so the Sidebar's mobile top bar (first child)
    // spans the full width above <main>. lg:flex-row puts the desktop
    // sidebar on the left of <main> at lg+. Without flex-col on
    // mobile the top bar would be treated as a narrow left-column
    // flex item instead of a full-width sticky header.
    <div className="flex flex-col lg:flex-row h-dvh overflow-hidden">
      <Sidebar
        role={user.role}
        userName={user.full_name}
        hasNoLeaveRestriction={hasNoLeaveRestriction}
        notificationBadge={
          <Suspense fallback={null}>
            <NotificationBadge userId={user.id} />
          </Suspense>
        }
        bulletinBadge={
          <Suspense fallback={null}>
            <BulletinBadge
              userId={user.id}
              userRole={user.role}
              assignedHouseIds={user.assigned_house_ids}
            />
          </Suspense>
        }
      />
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Safe-area insets so the main scroll region respects the
            iPhone notch, Dynamic Island, and home-indicator rail. No
            visual change on desktop — the env() values resolve to 0. */}
        <div className="container mx-auto p-4 lg:p-6 max-w-7xl pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:pt-[max(1.5rem,env(safe-area-inset-top))] lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </main>
    </div>
  );
}
