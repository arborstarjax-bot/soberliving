import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { createAdminClient } from "@/lib/supabase/server";

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

  // Redirect any user who is a resident (including admins/managers marked as residents)
  // and has a pending check-in — blocking task
  if (user.is_resident) {
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={user.role} userName={user.full_name} />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-4 lg:p-6 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
