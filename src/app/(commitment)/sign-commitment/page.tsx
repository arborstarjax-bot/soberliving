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

  // Surface move-in context on the contract itself so the resident
  // sees exactly what was collected, any outstanding balance, and
  // any house restrictions placed on them at check-in. Mirrors the
  // paper contract where all of this is recorded inline on page 1.

  // Restrictions created at intake for this resident/house. Uses
  // the `is_house_commitment` flag that intake-review/actions.ts
  // sets when inserting check-in restrictions.
  const residentId = commitment.resident_id as string | null;
  let restrictions: Array<{
    restriction_type: string;
    description: string;
    end_date: string | null;
  }> = [];
  if (residentId) {
    const { data: rows } = await adminClient
      .from("restrictions")
      .select("restriction_type, description, end_date")
      .eq("resident_id", residentId)
      .eq("is_house_commitment", true)
      .order("created_at", { ascending: true });
    restrictions = (rows ?? []).map((r) => ({
      restriction_type: r.restriction_type as string,
      description: r.description as string,
      end_date: (r.end_date as string | null) ?? null,
    }));
  }

  // Move-in payment summary. Look for the single payments row the
  // move-in flow records (payment_type='deposit', recorded at intake)
  // and its apportioned allocations against admin_fee + rent charges.
  let moveInSummary: {
    totalCollected: number;
    adminFeeApplied: number;
    rentApplied: number;
    partialReason: string | null;
    paidAt: string;
    method: string;
  } | null = null;
  if (residentId) {
    const { data: moveInPayment } = await adminClient
      .from("payments")
      .select("id, amount, payment_method, note, paid_at, due_date")
      .eq("resident_id", residentId)
      .eq("payment_type", "deposit")
      .eq("due_date", commitment.commitment_start_date)
      .order("paid_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (moveInPayment) {
      // Scoped by commitment_id so the due_date filter is unnecessary
      // (admin_fee and rent have different due_dates after the -1 day
      // policy shift). Commitment is uniquely identified already.
      const { data: charges } = await adminClient
        .from("payment_charges")
        .select("charge_type, paid_amount, amount")
        .eq("resident_id", residentId)
        .eq("commitment_id", commitment.id)
        .in("charge_type", ["admin_fee", "rent"]);

      let adminFeeApplied = 0;
      let rentApplied = 0;
      for (const c of charges ?? []) {
        const paid = Number(c.paid_amount ?? 0);
        if ((c.charge_type as string) === "admin_fee") {
          adminFeeApplied = paid;
        } else if ((c.charge_type as string) === "rent") {
          rentApplied = paid;
        }
      }

      moveInSummary = {
        totalCollected: Number(moveInPayment.amount ?? 0),
        adminFeeApplied,
        rentApplied,
        partialReason: (moveInPayment.note as string | null) ?? null,
        paidAt: moveInPayment.paid_at as string,
        method: moveInPayment.payment_method as string,
      };
    }
  }

  const skipInitialAdminFee =
    (commitment.skip_initial_admin_fee as boolean | null) === true;
  const isExistingTenant =
    (commitment.billing_anchor_date as string | null) !== null;

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
        skipInitialAdminFee={skipInitialAdminFee}
        isExistingTenant={isExistingTenant}
        restrictions={restrictions}
        moveInSummary={moveInSummary}
      />
    </div>
  );
}
