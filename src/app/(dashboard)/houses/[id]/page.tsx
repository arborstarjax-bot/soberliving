import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getDaysSober } from "@/lib/milestones";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { OccupancyGrid } from "./occupancy-grid";
import { AddRoomDialog } from "./add-room-dialog";
import { EditHouseDialog } from "../edit-house-dialog";
import { DeleteHouseDialog } from "../delete-house-dialog";
import { SupplyList, type SupplyItem } from "./supply-list";
import { DocumentsList, type HouseDocument } from "./documents-list";
import { StateOfHouseView } from "./state-of-house";
import { loadStateOfHouseData, resolveRange } from "./state-of-house-data";

export default async function HouseDetailPage(props: PageProps<"/houses/[id]">) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const user = await requireAuth();
  const supabase = await createClient();

  if (user.role !== "admin" && !canAccessHouse(user, id)) {
    redirect("/dashboard");
  }

  // All of these are independent once we have the house id — batch them
  // into a single Promise.all so the detail page renders in one DB
  // round-trip instead of seven sequential ones.
  const [
    { data: house },
    { data: rooms },
    { data: residents },
    { data: managerAssignments },
    { data: activity },
    { data: supplies },
    { data: documents },
  ] = await Promise.all([
    supabase.from("houses").select("*").eq("id", id).single(),
    supabase
      .from("rooms")
      .select(
        "*, beds(*, bed_assignments(*, resident:residents(id, full_name, status)))"
      )
      .eq("house_id", id)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("residents")
      .select("id, full_name, status, move_in_date, sobriety_date")
      .eq("house_id", id)
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("manager_house_assignments")
      .select("user_id, users(full_name, email)")
      .eq("house_id", id)
      .is("unassigned_at", null),
    supabase
      .from("activity_log")
      .select("id, event_type, description, created_at")
      .eq("house_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("supply_items")
      .select("id, name, is_in_stock, updated_at")
      .eq("house_id", id)
      .order("name"),
    supabase
      .from("house_documents")
      .select(
        "id, name, description, file_path, mime_type, size_bytes, created_at, uploader:users!uploaded_by(full_name)"
      )
      .eq("house_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!house) redirect("/houses");

  const canManage = user.role === "admin" || user.role === "manager";

  const roomsData = rooms ?? [];
  let totalBeds = 0;
  let occupiedBeds = 0;
  // Not-Available beds count as occupied per house policy: they still
  // hold the bed off the available pool and can't be filled until they're
  // marked available again. We don't expose a separate "not available"
  // count in the header.
  for (const room of roomsData) {
    for (const bed of room.beds ?? []) {
      if (!bed.is_active) continue;
      totalBeds++;
      const hasActive = (bed.bed_assignments ?? []).some(
        (ba: { end_date: string | null }) => !ba.end_date
      );
      const isUnavailable =
        bed.label.endsWith(" [Not Available]") ||
        bed.label.endsWith(" [Empty]");
      if (hasActive || isUnavailable) occupiedBeds++;
    }
  }

  // State-of-house params (controlled via URL so tabs work with server components)
  const tabParam = typeof searchParams?.tab === "string" ? searchParams.tab : "occupancy";
  const rangeParam =
    typeof searchParams?.range === "string" ? searchParams.range : "all_time";
  const startParam =
    typeof searchParams?.start === "string" ? searchParams.start : "";
  const endParam = typeof searchParams?.end === "string" ? searchParams.end : "";
  const houseTimezone =
    (house as { timezone?: string | null }).timezone || undefined;
  const dateRange = resolveRange(rangeParam, startParam, endParam, houseTimezone);
  const stateData = await loadStateOfHouseData(id, dateRange);

  const supplyItems: SupplyItem[] = (supplies ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    is_in_stock: s.is_in_stock,
    updated_at: s.updated_at,
  }));

  const houseDocuments: HouseDocument[] = ((documents ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    file_path: string;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
    uploader: { full_name: string } | { full_name: string }[] | null;
  }>).map((d) => {
    const uploader = Array.isArray(d.uploader) ? d.uploader[0] ?? null : d.uploader;
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      file_path: d.file_path,
      mime_type: d.mime_type,
      size_bytes: d.size_bytes,
      created_at: d.created_at,
      uploader_name: uploader?.full_name ?? null,
    };
  });

  const managerNames: string[] = (managerAssignments ?? [])
    .map((ma) => (ma.users as unknown as { full_name: string } | null)?.full_name)
    .filter((n): n is string => Boolean(n));

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
            <dd>{new Date(house.created_at).toLocaleDateString()}</dd>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-base">
            {occupiedBeds}/{totalBeds} beds occupied
          </Badge>
        </div>
      </div>

      {/* Controlled Tabs driven by the ?tab= URL param. Using `value` (not
          `defaultValue`) avoids the Base UI "uncontrolled default changed
          after init" warning that fires when the user navigates between
          tab-stated URLs for this page. Each trigger is rendered as a Link
          so switching tabs updates the URL (and preserves state-of-house
          query params). */}
      <Tabs value={tabParam}>
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar">
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
            Residents ({residents?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger
            value="supplies"
            nativeButton={false}
            render={<Link href={`/houses/${id}?tab=supplies`} />}
          >
            Supplies ({supplyItems.length})
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            nativeButton={false}
            render={<Link href={`/houses/${id}?tab=documents`} />}
          >
            Documents ({houseDocuments.length})
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

        <TabsContent value="occupancy" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <AddRoomDialog houseId={id} />
          </div>
          <OccupancyGrid
            rooms={roomsData}
            houseId={id}
            residents={residents ?? []}
            userRole={user.role}
          />
        </TabsContent>

        <TabsContent value="residents" className="mt-4">
          {residents && residents.length > 0 ? (
            <div className="space-y-2">
              {residents.map((r) => (
                <Link key={r.id} href={`/residents/${r.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors">
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{r.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Moved in:{" "}
                          {new Date(r.move_in_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.sobriety_date && (
                          <span className="text-xs text-muted-foreground">
                            {getDaysSober(r.sobriety_date)} days sober
                          </span>
                        )}
                        <Badge variant="outline" className="capitalize">
                          {r.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              No active residents in this house
            </p>
          )}
        </TabsContent>

        <TabsContent value="supplies" className="mt-4">
          <SupplyList
            houseId={id}
            items={supplyItems}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsList
            houseId={id}
            documents={houseDocuments}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="state" className="mt-4">
          <StateOfHouseView
            houseId={id}
            range={rangeParam}
            customStart={startParam}
            customEnd={endParam}
            rangeLabel={dateRange.label}
            data={stateData}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          {activity && activity.length > 0 ? (
            <div className="space-y-3">
              {activity.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 text-sm border-b pb-3 last:border-0"
                >
                  <div className="flex-1">
                    <p>{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              No activity yet
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
