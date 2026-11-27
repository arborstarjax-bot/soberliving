import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getWorkspaceSettings } from "@/lib/workspace";
import { ListSkeleton } from "@/components/ui/skeleton";
import { StaffPaymentsSection } from "./staff-payments-section";

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
 * * Rent Roll + History tabs stream in
 * behind a second boundary.
 *
 * Charge sweep runs in `/api/cron/sweep-charges` daily.
 */
export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const user = await requireAuth();
  const isStaff = user.role === "admin" || user.role === "manager";

  if (!isStaff) {
    redirect("/dashboard");
  }

  const wsSettings = user.workspace_id
    ? await getWorkspaceSettings(user.workspace_id)
    : null;
  if (wsSettings?.enable_payments === false) {
    redirect("/admin");
  }

  // searchParams is reserved for future filters (e.g. ?house=xxx).
  await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-muted-foreground">
          Weekly & monthly rent, balances, and receipts
        </p>
      </div>

      <Suspense
        fallback={<ListSkeleton rows={6} rowClassName="h-24 w-full" />}
      >
        <StaffPaymentsSection user={user} />
      </Suspense>
    </div>
  );
}
