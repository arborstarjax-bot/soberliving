import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function IntakeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Discharged residents can't re-do intake
  if (user.role === "resident" && user.resident_discharged) {
    redirect("/discharged");
  }

  // If intake is already completed, redirect to dashboard
  if (user.intake_completed) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl p-4 lg:p-8">
        {children}
      </div>
    </div>
  );
}
