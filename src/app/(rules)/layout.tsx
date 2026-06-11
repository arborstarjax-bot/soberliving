import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Any user who is a resident (regardless of admin/manager role) and
  // hasn't acknowledged rules yet. Non-residents skip straight to dashboard.
  if (!user.is_resident) {
    redirect("/dashboard");
  }

  if (!user.intake_completed) {
    redirect("/intake");
  }

  if (user.rules_acknowledged) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-dvh bg-background">
      {children}
    </div>
  );
}
