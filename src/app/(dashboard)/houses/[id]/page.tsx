import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { EditHouseDialog } from "../edit-house-dialog";
import { DeleteHouseDialog } from "../delete-house-dialog";
import { BedCountBadge } from "./bed-count-badge";
import { OccupancySection } from "./occupancy-section";
import { ResidentsSection } from "./residents-section";
import { SuppliesSection } from "./supplies-section";
import { DocumentsSection } from "./documents-section";
import { SafetySection } from "./safety-section";
import { StateSection } from "./state-section";
import { ActivitySection } from "./activity-section";

/**
 * House detail shell. The house record + manager names paint
 * immediately; the bed-count badge, and the selected tab body,
 * each stream in behind their own `<Suspense>` boundary.
 *
 * Only the active tab's data fetches — switching tabs triggers a
 * fresh server render with the new `?tab=` param, and each tab
 * section fetches only what it needs. No more single-gather-holds-
 * up-everything.
 */
export default async function HouseDetailPage(props: PageProps<"/houses/[id]">) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const user = await requireAuth();
  const supabase = await createClient();

  // canAccessHouse already scopes admins to their workspace's houses
  // (workspace_house_ids), so an admin can't open a house in another
  // workspace by guessing its id.
  if (!canAccessHouse(user, id)) {
    redirect("/dashboard");
  }

  const [{ data: house }, { data: managerAssignments }] = await Promise.all([
    supabase.from("houses").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("manager_house_assignments")
      .select("users!inner(full_name), unassigned_at")
      .eq("house_id", id)
      .is("unassigned_at", null),
  ]);

  if (!house) redirect("/houses");

  const canManage = user.role === "admin" || user.role === "manager";

  const managerNames: string[] = (managerAssignments ?? [])
    .map((ma) => (ma.users as unknown as { full_name: string } | null)?.full_name)
    .filter((n): n is string => Boolean(n));

  const tabParam =
    typeof searchParams?.tab === "string" ? searchParams.tab : "occupancy";
  const rangeParam =
    typeof searchParams?.range === "string" ? searchParams.range : "all_time";
  const startParam =
    typeof searchParams?.start === "string" ? searchParams.start : "";
  const endParam =
    typeof searchParams?.end === "string" ? searchParams.end : "";
  const houseTimezone =
    (house as { timezone?: string | null }).timezone || undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{house.name}</h1>
            {canManage && (
              <>
                <EditHouseDialog
                  houseId={house.id}
                  currentName={house.name}
                  currentAddress={house.address}
                  currentPhone={house.phone}
                />
                <DeleteHouseDialog houseId={house.id} houseName={house.name} />
              </>
            )}
          </div>
          <dl className="mt-1 grid gap-x-6 gap-y-0.5 text-sm text-muted-foreground sm:grid-cols-[auto_1fr]">
            <dt className="font-medium text-foreground/70">Address</dt>
            <dd>{house.address || "—"}</dd>
            <dt className="font-medium text-foreground/70">Phone</dt>
            <dd>{house.phone || "—"}</dd>
            <dt className="font-medium text-foreground/70">Managers</dt>
            <dd>
              {managerNames.length > 0 ? managerNames.join(", ") : "—"}
            </dd>
            <dt className="font-medium text-foreground/70">Created</dt>
            <dd>
              {new Date(house.created_at).toLocaleDateString("en-US", {
                timeZone: "America/New_York",
              })}
            </dd>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Suspense
            fallback={<Skeleton className="h-6 w-32 rounded-full" />}
          >
            <BedCountBadge houseId={id} />
          </Suspense>
        </div>
      </div>

      {/* Controlled Tabs driven by the ?tab= URL param. Using `value` (not
          `defaultValue`) avoids the Base UI "uncontrolled default changed
          after init" warning that fires when the user navigates between
          tab-stated URLs for this page. Each trigger is rendered as a Link
          so switching tabs updates the URL (and preserves state-of-house
          query params). Each tab body is its own `<Suspense>` island; only
          the active tab's data fetches. */}
      <Tabs value={tabParam}>
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar [&>a]:flex-none [&>a]:whitespace-nowrap [&>button]:flex-none [&>button]:whitespace-nowrap">
          <TabsTrigger
            value="occupancy"
            nativeButton={false}
            render={<Link href={`/houses/${id}?tab=occupancy`} />}
          >
            Occupancy
          </TabsTrigger>
          <TabsTrigger
            value="residents"
            nativeButton={false}
            render={<Link href={`/houses/${id}?tab=residents`} />}
          >
            Residents
          </TabsTrigger>
          <TabsTrigger
            value="supplies"
            nativeButton={false}
            render={<Link href={`/houses/${id}?tab=supplies`} />}
          >
            Supplies
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            nativeButton={false}
            render={<Link href={`/houses/${id}?tab=documents`} />}
          >
            Documents
          </TabsTrigger>
          <TabsTrigger
            value="safety"
            nativeButton={false}
            render={<Link href={`/houses/${id}?tab=safety`} />}
          >
            Safety
          </TabsTrigger>
          <TabsTrigger
            value="state"
            nativeButton={false}
            render={<Link href={`/houses/${id}?tab=state`} />}
          >
            State of the House
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            nativeButton={false}
            render={<Link href={`/houses/${id}?tab=activity`} />}
          >
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="occupancy" className="mt-4">
          {tabParam === "occupancy" && (
            <Suspense
              fallback={<ListSkeleton rows={3} rowClassName="h-32 w-full" />}
            >
              <OccupancySection houseId={id} userRole={user.role} />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="residents" className="mt-4">
          {tabParam === "residents" && (
            <Suspense
              fallback={<ListSkeleton rows={5} rowClassName="h-16 w-full" />}
            >
              <ResidentsSection houseId={id} />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="supplies" className="mt-4">
          {tabParam === "supplies" && (
            <Suspense
              fallback={<ListSkeleton rows={5} rowClassName="h-14 w-full" />}
            >
              <SuppliesSection houseId={id} canManage={canManage} />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {tabParam === "documents" && (
            <Suspense
              fallback={<ListSkeleton rows={4} rowClassName="h-20 w-full" />}
            >
              <DocumentsSection houseId={id} canManage={canManage} />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="safety" className="mt-4">
          {tabParam === "safety" && (
            <Suspense
              fallback={<ListSkeleton rows={4} rowClassName="h-20 w-full" />}
            >
              <SafetySection
                houseId={id}
                canManage={canManage}
                houseTimezone={houseTimezone}
              />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="state" className="mt-4">
          {tabParam === "state" && (
            <Suspense
              fallback={<ListSkeleton rows={6} rowClassName="h-24 w-full" />}
            >
              <StateSection
                houseId={id}
                rangeParam={rangeParam}
                startParam={startParam}
                endParam={endParam}
                houseTimezone={houseTimezone}
              />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          {tabParam === "activity" && (
            <Suspense
              fallback={<ListSkeleton rows={8} rowClassName="h-10 w-full" />}
            >
              <ActivitySection houseId={id} />
            </Suspense>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
