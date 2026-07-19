import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CommitmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Discharged residents shouldn't be re-signing anything — route
  // them to the lockout page.
  if (user.role === "resident" && user.resident_discharged) {
    redirect("/discharged");
  }

  // Only residents who completed intake but haven't signed commitment should be here
  if (user.role === "resident" && !user.intake_completed) {
    redirect("/intake");
  }

  // If already signed AND there's no pending amendment awaiting this
  // resident's signature, bounce back to the dashboard. The extra
  // has_pending_commitment guard keeps residents on /sign-commitment
  // when an admin has proposed an amendment after the initial
  // commitment was signed (commitment_signed stays true in that case,
  // so without this check the dashboard layout would loop them back
  // here and this layout would bounce them to /dashboard immediately).
  if (
    user.role === "resident" &&
    user.commitment_signed &&
    !user.has_pending_commitment
  ) {
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
