import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CommitmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Only residents who completed intake but haven't signed commitment should be here
  if (user.role === "resident" && !user.intake_completed) {
    redirect("/intake");
  }

  // If already signed, go to dashboard
  if (user.role === "resident" && user.commitment_signed) {
    redirect("/dashboard");
  }

  // Non-residents shouldn't be on this page
  if (user.role !== "resident") {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 lg:p-6 max-w-4xl">
        {children}
      </div>
    </div>
  );
}
