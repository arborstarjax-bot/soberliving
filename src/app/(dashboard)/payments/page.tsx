import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ListSkeleton } from "@/components/ui/skeleton";
import { StaffPaymentsSection } from "./staff-payments-section";
import { CreatePaymentSection } from "./create-payment-section";

interface PaymentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Payments shell. Staff-only by policy: residents are redirected
 * to their dashboard because payment tracking is handled
 * internally and not surfaced in the resident-facing UI.
 *
 * Title + subtitle paint immediately. Staff see the Record
 * Payment button populated in its own `<Suspense>` island. The
 * heavy RentStructure / RentFlowKpis / 3-tab body streams in
 * behind a second boundary.
 *
 * Charge sweep runs in `/api/cron/sweep-charges` daily.
 */
export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const user = await requireAuth();
  const isStaff = user.role === "admin" || user.role === "manager";

  // Residents no longer have a payments view. Redirect to dashboard
  // so any deep link (old notification, browser history) lands
  // somewhere coherent instead of a blank page.
  if (!isStaff) {
    redirect("/dashboard");
  }

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
        <Suspense fallback={null}>
          <CreatePaymentSection user={user} />
        </Suspense>
      </div>

      <Suspense
        fallback={<ListSkeleton rows={6} rowClassName="h-24 w-full" />}
      >
        <StaffPaymentsSection user={user} />
      </Suspense>
    </div>
  );
}
