import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { ListSkeleton } from "@/components/ui/skeleton";
import { ResidentPaymentsSection } from "./resident-payments-section";
import { StaffPaymentsSection } from "./staff-payments-section";
import { CreatePaymentSection } from "./create-payment-section";

interface PaymentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Payments shell. Title + subtitle paint immediately. Staff see
 * the Record Payment button populated in its own `<Suspense>`
 * island. The heavy RentStructure / RentFlowKpis / 3-tab body
 * (staff) or the resident's Payment Terms + charges + ledger
 * (resident) streams in behind a second boundary.
 *
 * Charge sweep runs in `/api/cron/sweep-charges` daily — residents
 * still get a targeted backfill in `ResidentPaymentsSection`.
 */
export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const user = await requireAuth();
  const isStaff = user.role === "admin" || user.role === "manager";

  // searchParams is reserved for future filters (e.g. ?house=xxx).
  await searchParams;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-muted-foreground">
            Track rent flow, open balances, and receipts
          </p>
        </div>
        {isStaff && (
          <Suspense fallback={null}>
            <CreatePaymentSection user={user} />
          </Suspense>
        )}
      </div>

      {user.role === "resident" && (
        <Suspense
          fallback={<ListSkeleton rows={4} rowClassName="h-24 w-full" />}
        >
          <ResidentPaymentsSection user={user} />
        </Suspense>
      )}

      {isStaff && (
        <Suspense
          fallback={<ListSkeleton rows={6} rowClassName="h-24 w-full" />}
        >
          <StaffPaymentsSection user={user} />
        </Suspense>
      )}
    </div>
  );
}
