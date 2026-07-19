import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { openAllChargesForCommitment } from "@/lib/payments/charges";
import { ResidentPaymentsView } from "./resident-view";
import type { SessionUser } from "@/lib/types";

interface ResidentPaymentsSectionProps {
  user: SessionUser;
}

/**
 * Resident Payments section — Payment Terms card + Upcoming/Past
 * tabs. Lives behind a `<Suspense>` boundary on `page.tsx` so the
 * header paints immediately while the resident's commitment /
 * charge backfill / ledger fetch runs.
 */
export async function ResidentPaymentsSection({
  user,
}: ResidentPaymentsSectionProps) {
  const supabase = await createClient();

  const { data: residentRow } = await supabase
    .from("residents")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!residentRow) {
    return (
      <ResidentPaymentsView terms={null} openCharges={[]} payments={[]} />
    );
  }

  const residentId = residentRow.id as string;

  const { data: commitment } = await supabase
    .from("house_commitments")
    .select(
      "id, rent_amount, admin_fee, commitment_start_date, pdf_storage_path"
    )
    .eq("resident_id", residentId)
    .eq("status", "active")
    .order("commitment_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let residentTerms: {
    rent_amount: number;
    admin_fee: number | null;
    commitment_start_date: string;
    pdf_storage_path: string | null;
    pdf_signed_url: string | null;
  } | null = null;
  if (commitment?.id) {
    try {
      await openAllChargesForCommitment(commitment.id as string);
    } catch (e) {
      console.error("Resident charge backfill failed", e);
    }
    // Pre-sign the stored PDF URL server-side so the View Signed
    // Commitment button renders as a native <a href> — iOS Safari
    // drops `window.open` calls that happen after an async server
    // action resolves because the user-gesture window has closed.
    const storagePath =
      (commitment.pdf_storage_path as string | null) ?? null;
    let signedUrl: string | null = null;
    if (storagePath) {
      try {
        const admin = createAdminClient();
        const { data } = await admin.storage
          .from("documents")
          .createSignedUrl(storagePath, 3600);
        signedUrl = data?.signedUrl ?? null;
      } catch (e) {
        console.error("Failed to sign commitment PDF URL", e);
      }
    }
    residentTerms = {
      rent_amount: Number(commitment.rent_amount ?? 0),
      admin_fee:
        commitment.admin_fee !== null && commitment.admin_fee !== undefined
          ? Number(commitment.admin_fee)
          : null,
      commitment_start_date: commitment.commitment_start_date as string,
      pdf_storage_path: storagePath,
      pdf_signed_url: signedUrl,
    };
  }

  const [{ data: payments }, { data: openCharges }] = await Promise.all([
    supabase
      .from("payments")
      .select("*")
      .eq("resident_id", residentId)
      .order("paid_at", { ascending: false })
      .limit(500),
    supabase
      .from("payment_charges")
      .select(
        "id, charge_type, amount, paid_amount, due_date, period_start, period_end, status"
      )
      .eq("resident_id", residentId)
      .in("status", ["open", "partial"])
      .order("due_date", { ascending: true }),
  ]);

  return (
    <ResidentPaymentsView
      terms={residentTerms}
      openCharges={(openCharges ?? []).map((c) => ({
        id: c.id as string,
        charge_type: c.charge_type as string,
        amount: Number(c.amount),
        paid_amount: Number(c.paid_amount),
        due_date: c.due_date as string,
        period_start: (c.period_start as string | null) ?? null,
        period_end: (c.period_end as string | null) ?? null,
        status: c.status as string,
      }))}
      payments={(payments ?? []).map((p) => ({
        id: p.id as string,
        amount: Number(p.amount),
        payment_type: (p.payment_type as string | null) ?? null,
        payment_method: (p.payment_method as string | null) ?? null,
        paid_at: p.paid_at as string,
        status: p.status as string,
        receipt_number: (p.receipt_number as string | null) ?? null,
        receipt_storage_path: (p.receipt_storage_path as string | null) ?? null,
        note: (p.note as string | null) ?? null,
      }))}
    />
  );
}
