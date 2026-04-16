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
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={user.role} userName={user.full_name} hasNoLeaveRestriction={hasNoLeaveRestriction} />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-4 lg:p-6 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
