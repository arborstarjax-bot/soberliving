import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommitmentSigningForm } from "./commitment-signing-form";

export default async function SignCommitmentPage() {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  // Get pending commitment for this user
  const { data: commitment } = await adminClient
    .from("house_commitments")
    .select("*, houses(name, address)")
    .eq("user_id", user.id)
    .eq("status", "pending_resident_signature")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!commitment) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Waiting for Admin Review</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Your application has been submitted successfully. An administrator or
              manager will review your application and prepare your house commitment
              agreement. You&apos;ll be able to sign it once it&apos;s ready.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Please check back later or contact your house manager for updates.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const house = commitment.houses as { name: string; address: string | null } | null;

  // If this is an amendment (parent_commitment_id set), fetch the
  // parent row so the signing form can show old-vs-new side by side.
  // Residents agreed to specific terms originally; they should see
  // exactly what's changing before re-signing.
  const parentId = commitment.parent_commitment_id as string | null;
  let parentTerms: {
    rent_amount: number;
    admin_fee: number | null;
    commitment_start_date: string;
  } | null = null;
  if (parentId) {
    const { data: parent } = await adminClient
      .from("house_commitments")
      .select("rent_amount, admin_fee, commitment_start_date")
      .eq("id", parentId)
      .maybeSingle();
    if (parent) {
      parentTerms = {
        rent_amount: Number(parent.rent_amount ?? 0),
        admin_fee:
          parent.admin_fee !== null && parent.admin_fee !== undefined
            ? Number(parent.admin_fee)
            : null,
        commitment_start_date: parent.commitment_start_date as string,
      };
    }
  }

  const isAmendment = Boolean(parentId);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">
          {isAmendment
            ? "Updated Commitment — Amendment"
            : "House Commitment Agreement"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isAmendment
            ? "Your payment terms have been updated. Please review and sign the amendment below."
            : "Please review and sign the agreement below to complete your move-in process"}
        </p>
      </div>

      <CommitmentSigningForm
        commitmentId={commitment.id}
        residentName={user.full_name}
        houseName={house?.name ?? ""}
        propertyLocation={commitment.property_location ?? house?.address ?? ""}
        rentAmount={commitment.rent_amount}
        adminFee={commitment.admin_fee}
        paymentFrequency={commitment.payment_frequency}
        rentDueDate={commitment.rent_due_date}
        commitmentStartDate={commitment.commitment_start_date}
        commitmentTerm={commitment.commitment_term}
        notes={commitment.notes}
        staffSignature={commitment.staff_signature}
        staffSignedAt={commitment.staff_signed_at}
        amendmentReason={
          (commitment.amendment_reason as string | null) ?? null
        }
        parentTerms={parentTerms}
      />
    </div>
  );
}
