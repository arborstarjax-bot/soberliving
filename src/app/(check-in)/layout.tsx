import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CheckInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Only residents should access the check-in form
  if (user.role !== "resident") {
    redirect("/dashboard");
  }

  // Must have completed intake + commitment first
  if (!user.intake_completed) {
    redirect("/intake");
  }
  if (!user.commitment_signed) {
    redirect("/sign-commitment");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl p-4 lg:p-8">
        {children}
      </div>
    </div>
  );
}
