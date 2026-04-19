import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ListSkeleton } from "@/components/ui/skeleton";
import { GrievancesListSection } from "./grievances-list-section";

/**
 * Grievances (staff inventory). Shell renders immediately; the
 * list streams in behind a `<Suspense>` boundary.
 */
export default async function GrievancesPage() {
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "manager") {
    redirect("/bulletin");
  }

  return (
    <div className="space-y-6">
      <Suspense
        fallback={<ListSkeleton rows={6} rowClassName="h-24 w-full" />}
      >
        <GrievancesListSection user={user} />
      </Suspense>
    </div>
  );
}
