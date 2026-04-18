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
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl p-4 lg:p-8">
        {children}
      </div>
    </div>
  );
}
