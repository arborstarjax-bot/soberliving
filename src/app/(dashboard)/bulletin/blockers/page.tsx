import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { NewBlockerSection } from "./new-blocker-section";
import { BlockersListSection } from "./blockers-list-section";

/**
 * Notices (formerly "Blockers") — staff-only composer + list view.
 * Shell renders immediately; the composer card and the list each
 * stream in behind their own `<Suspense>` boundary.
 */
export default async function BlockersPage() {
  const user = await requireAuth();

  if (user.role !== "admin" && user.role !== "manager") {
    redirect("/bulletin");
  }

  return (
    <div className="space-y-6">
      <Suspense
        fallback={<Skeleton className="h-48 w-full rounded-xl" />}
      >
        <NewBlockerSection user={user} />
      </Suspense>
      <Suspense
        fallback={<ListSkeleton rows={5} rowClassName="h-24 w-full" />}
      >
        <BlockersListSection user={user} />
      </Suspense>
    </div>
  );
}
