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

  // If intake is already completed, move to next step
  if (user.intake_completed) {
    // If rules not yet acknowledged, go to rules presentation
    if (!user.rules_acknowledged) {
      redirect("/rules");
    }
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
