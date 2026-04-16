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

export default async function HouseDetailPage(props: PageProps<"/houses/[id]">) {
  const { id } = await props.params;
  const user = await requireAuth();
  const supabase = await createClient();

  if (user.role !== "admin" && !canAccessHouse(user, id)) {
    redirect("/dashboard");
  }

  const { data: house } = await supabase
    .from("houses")
    .select("*")
    .eq("id", id)
    .single();

  if (!house) redirect("/houses");

  // Rooms with beds and assignments
  const { data: rooms } = await supabase
    .from("rooms")
    .select(
      "*, beds(*, bed_assignments(*, resident:residents(id, full_name, status)))"
    )
    .eq("house_id", id)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  // Residents in this house
  const { data: residents } = await supabase
    .from("residents")
    .select("id, full_name, status, move_in_date, sobriety_date")
    .eq("house_id", id)
    .eq("status", "active")
    .order("full_name");

  // Managers assigned to this house
  const { data: managerAssignments } = await supabase
    .from("manager_house_assignments")
    .select("user_id, users(full_name, email)")
    .eq("house_id", id)
    .is("unassigned_at", null);

  // Recent activity for this house
  const { data: activity } = await supabase
    .from("activity_log")
    .select("id, event_type, description, created_at")
    .eq("house_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const roomsData = rooms ?? [];
  let totalBeds = 0;
  let occupiedBeds = 0;
  let emptyBeds = 0;
  for (const room of roomsData) {
    for (const bed of room.beds ?? []) {
      if (!bed.is_active) continue;
      totalBeds++;
      const hasActive = (bed.bed_assignments ?? []).some(
        (ba: { end_date: string | null }) => !ba.end_date
      );
      if (hasActive) occupiedBeds++;
      else if (bed.label.endsWith(" [Empty]")) emptyBeds++;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{house.name}</h1>
            {(user.role === "admin" || user.role === "manager") && (
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
          {house.address && (
            <p className="text-muted-foreground">{house.address}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-base">
            {occupiedBeds}/{totalBeds} beds occupied
          </Badge>
          {emptyBeds > 0 && (
            <Badge variant="outline" className="text-base border-amber-400 text-amber-700">
              {emptyBeds} empty
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="occupancy">
        <TabsList>
          <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
          <TabsTrigger value="residents">
            Residents ({residents?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
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

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div>
                <p className="text-sm text-muted-foreground">Address</p>
                <p>{house.address || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p>{house.phone || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Managers</p>
                {managerAssignments && managerAssignments.length > 0 ? (
                  <div className="space-y-1">
                    {managerAssignments.map((ma) => (
                      <p key={ma.user_id}>
                        {(ma.users as unknown as { full_name: string } | null)?.full_name}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p>No managers assigned</p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p>{new Date(house.created_at).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
