import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Only residents who completed intake but haven't acknowledged rules
  if (user.role !== "resident") {
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
