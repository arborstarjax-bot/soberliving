import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { AmendCommitmentForm } from "./amend-commitment-form";

// Admin-only full-page form used to edit an active commitment
// agreement. Drafts a new house_commitments row (status =
// pending_resident_signature) linked to the currently active one as
// the parent. Mirrors the intake-review workflow: the admin fills out
// the same sections (rent terms, notes, admin-fee treatment, staff
// signature) and re-signs, the resident signs through
// /sign-commitment, and on sign the parent is marked 'superseded'.
//
// The dashboard layout gates every resident route on
// has_pending_commitment, so the moment this page is submitted the
// resident is hard-blocked until they sign the amendment.
export default async function AmendCommitmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole("admin");
  const adminClient = createAdminClient();

  const { data: resident } = await adminClient
    .from("residents")
    .select("id, user_id, full_name, house_id")
    .eq("id", id)
    .maybeSingle();

  if (!resident) notFound();

  const userId = resident.user_id as string | null;
  if (!userId) {
    // An active commitment is keyed on user_id in the signing flow —
    // residents without a linked auth user can't receive a signature
    // request, so block the amendment at the entry point.
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-8">
        <Link
          href={`/residents/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to resident
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Commitment can&apos;t be amended</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This resident has no linked user account, so there&apos;s no one
              to send the amended agreement to for signature. Link an auth
              user to the resident record first, then try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: active } = await adminClient
    .from("house_commitments")
    .select(
      "id, rent_amount, admin_fee, payment_frequency, commitment_start_date, commitment_term, restrictions_notes, notes, house_id, room_id, bed_id"
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("commitment_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!active) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-8">
        <Link
          href={`/residents/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to resident
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>No active commitment to amend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This resident doesn&apos;t have an active commitment agreement
              on file. Use the Intake Review workflow to create the initial
              commitment.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Guard: if an amendment is already in flight, bounce back to the
  // resident page where the amber "awaiting signature" callout
  // explains the cancel-first flow. Mirrors the preflight check in
  // proposeAmendment().
  const { data: pending } = await adminClient
    .from("house_commitments")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending_resident_signature")
    .maybeSingle();
  if (pending) redirect(`/residents/${id}?payments_amendment_pending=1`);

  // Contextual housing info for the read-only section. Amendments
  // don't change the resident's bed — that's what Transfer House is
  // for. Surfacing it here mirrors the "Housing Assignment" section
  // from the intake-review form so the workflow feels identical.
  const [houseRes, roomRes, bedRes] = await Promise.all([
    active.house_id
      ? adminClient
          .from("houses")
          .select("name, address")
          .eq("id", active.house_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    active.room_id
      ? adminClient
          .from("rooms")
          .select("name")
          .eq("id", active.room_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    active.bed_id
      ? adminClient
          .from("beds")
          .select("label")
          .eq("id", active.bed_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Default effective date = one month out from today. Lines up with
  // the typical admin cadence of proposing an amendment now that
  // takes effect at the next billing cycle.
  const effectiveDefault = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center gap-2">
        <Link
          href={`/residents/${id}`}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to resident
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">
          Amend Commitment Agreement
        </h1>
        <p className="text-muted-foreground">
          Drafting an updated house commitment agreement for{" "}
          <span className="font-medium text-foreground">
            {resident.full_name}
          </span>
          . The resident will be hard-blocked from using the app until they
          review and sign the new agreement.
        </p>
      </div>

      <AmendCommitmentForm
        residentId={id}
        userId={userId}
        residentName={resident.full_name as string}
        currentHouseName={
          (houseRes.data as { name?: string } | null)?.name ?? null
        }
        currentHouseAddress={
          (houseRes.data as { address?: string | null } | null)?.address ??
          null
        }
        currentRoomName={
          (roomRes.data as { name?: string } | null)?.name ?? null
        }
        currentBedLabel={
          (bedRes.data as { label?: string } | null)?.label ?? null
        }
        currentRent={Number(active.rent_amount ?? 0)}
        currentAdminFee={Number(active.admin_fee ?? 0)}
        currentPaymentFrequency={
          (active.payment_frequency as "weekly" | "monthly") ?? "monthly"
        }
        currentCommitmentTerm={
          (active.commitment_term as string | null) ?? "181 days"
        }
        currentRestrictionsNotes={
          (active.restrictions_notes as string | null) ?? ""
        }
        currentNotes={(active.notes as string | null) ?? ""}
        effectiveDateDefault={effectiveDefault}
      />
    </div>
  );
}
