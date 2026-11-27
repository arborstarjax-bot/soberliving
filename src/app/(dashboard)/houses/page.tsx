import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { ListSkeleton } from "@/components/ui/skeleton";
import { CreateHouseDialog } from "./create-house-dialog";
import { HousesGridSection } from "./houses-grid-section";

interface HousesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HousesPage({ searchParams }: HousesPageProps) {
  const user = await requireAuth();
  const houseFilter = getAccessibleHouseFilter(user);
  const params = await searchParams;

  const suspenseKey = `c=${params.c ?? ""}&cp=${params.cp ?? ""}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Houses</h1>
          <p className="text-muted-foreground">
            Manage your houses
          </p>
        </div>
        {user.role === "admin" && <CreateHouseDialog />}
      </div>

      <Suspense
        key={suspenseKey}
        fallback={<ListSkeleton rows={6} rowClassName="h-40 w-full" />}
      >
        <HousesGridSection
          houseFilter={houseFilter}
          searchParams={params}
        />
      </Suspense>
    </div>
  );
}
