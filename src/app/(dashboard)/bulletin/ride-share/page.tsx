import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { ListSkeleton } from "@/components/ui/skeleton";
import { NewRideForm } from "./new-ride-form";
import { RideListSection } from "./ride-list-section";

interface RideSharePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RideSharePage({
  searchParams,
}: RideSharePageProps) {
  const user = await requireAuth();
  const admin = createAdminClient();
  const params = await searchParams;
  const showPast = params.past === "1";

  // Shell-fast queries (needed to render the NewRideForm and compute
  // the resident's visible-house filter). These are single-row
  // lookups on indexed columns and do not block the feed.
  let postableHouses: { id: string; name: string }[] = [];
  let myHouseId: string | null = null;
  if (user.role === "admin") {
    const { data } = await admin
      .from("houses")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    postableHouses = data ?? [];
  } else if (user.role === "manager") {
    if (user.assigned_house_ids.length > 0) {
      const { data } = await admin
        .from("houses")
        .select("id, name")
        .in("id", user.assigned_house_ids)
        .eq("is_active", true)
        .order("name");
      postableHouses = data ?? [];
    }
  } else {
    const { data: resident } = await admin
      .from("residents")
      .select("house_id, house:houses!inner(id, name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (resident) {
      const house = resident.house as unknown as { id: string; name: string };
      postableHouses = [{ id: house.id, name: house.name }];
      myHouseId = house.id;
    }
  }

  let visibleHouseIds: string[] | null = null;
  if (user.role === "resident") {
    visibleHouseIds = myHouseId ? [myHouseId] : [];
  } else if (user.role === "manager") {
    visibleHouseIds =
      user.assigned_house_ids.length > 0 ? user.assigned_house_ids : [];
  }

  // Suspense key resets the fallback skeleton when the user paginates
  // or toggles past rides, so we always see a fresh loading state.
  const suspenseKey = `c=${params.c ?? ""}&cp=${params.cp ?? ""}&past=${
    showPast ? "1" : "0"
  }`;

  return (
    <div className="space-y-6">
      <NewRideForm
        houses={postableHouses}
        singleHouse={user.role === "resident" && postableHouses.length === 1}
      />

      {user.role !== "resident" && <PastToggle showPast={showPast} />}

      <Suspense
        key={suspenseKey}
        fallback={<ListSkeleton rows={4} rowClassName="h-28 w-full" />}
      >
        <RideListSection
          currentUserId={user.id}
          currentUserRole={user.role}
          visibleHouseIds={visibleHouseIds}
          showPast={showPast}
          searchParams={params}
        />
      </Suspense>
    </div>
  );
}

function PastToggle({ showPast }: { showPast: boolean }) {
  return (
    <div className="flex items-center justify-end">
      <a
        href={showPast ? "/bulletin/ride-share" : "/bulletin/ride-share?past=1"}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        {showPast ? "Hide past rides" : "Show past rides"}
      </a>
    </div>
  );
}
