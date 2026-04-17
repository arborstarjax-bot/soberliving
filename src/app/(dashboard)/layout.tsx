import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { createAdminClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Redirect resident-role users who haven't completed intake
  // Only applies to role=resident, NOT admins/managers who are also marked as residents
  if (user.role === "resident" && !user.intake_completed) {
    redirect("/intake");
  }

  // Redirect residents who completed intake but haven't signed their commitment agreement
  if (user.role === "resident" && user.intake_completed && !user.commitment_signed) {
    redirect("/sign-commitment");
  }

  // Redirect ANY user who has a pending check-in (blocking task).
  // This covers admins/managers who are also residents.
  {
    const adminClient = createAdminClient();
    const { data: pendingCheckIn } = await adminClient
      .from("check_in_responses")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (pendingCheckIn) {
      redirect(`/check-in/${pendingCheckIn.id}`);
    }
  }

  // Fetch unread notification count for sidebar badge
  let unreadNotificationCount = 0;
  {
    const supabase = await createClient();
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    unreadNotificationCount = count ?? 0;
  }

  // Check if resident has an active "no_leave" restriction to hide Leave Requests nav
  let hasNoLeaveRestriction = false;
  if (user.role === "resident") {
    const supabase = await createClient();
    const { data: myResident } = await supabase
      .from("residents")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (myResident) {
      const { data: noLeave } = await supabase
        .from("restrictions")
        .select("id")
        .eq("resident_id", myResident.id)
        .eq("is_active", true)
        .in("restriction_type", ["no_leave", "house_commitment"])
        .limit(1)
        .maybeSingle();
      hasNoLeaveRestriction = !!noLeave;
    }
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
      <Sidebar role={user.role} userName={user.full_name} hasNoLeaveRestriction={hasNoLeaveRestriction} unreadNotificationCount={unreadNotificationCount} />
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
