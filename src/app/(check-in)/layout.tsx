import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CheckInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Residents must complete intake + commitment before anything else.
  // has_pending_commitment catches amendments proposed after the
  // original commitment was signed (commitment_signed stays true).
  if (user.role === "resident") {
    if (!user.intake_completed) {
      redirect("/intake");
    }
    if (!user.commitment_signed || user.has_pending_commitment) {
      redirect("/sign-commitment");
    }
    // Blockers are a higher-priority gate than check-ins — same model
    // as the dashboard layout. Keeps the resident on /acknowledge
    // until every active blocker targeted at them has been signed.
    if (user.pending_blocker_id) {
      redirect(`/acknowledge/${user.pending_blocker_id}`);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl p-4 lg:p-8">
        {children}
      </div>
    </div>
  );
}
