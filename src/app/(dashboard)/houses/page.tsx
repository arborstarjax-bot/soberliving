import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home } from "lucide-react";
import Link from "next/link";
import { CreateHouseDialog } from "./create-house-dialog";

export default async function HousesPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let query = supabase
    .from("houses")
    .select("*, rooms(id, beds(id, bed_assignments(id, end_date)))")
    .eq("is_active", true)
    .order("name");

  if (houseFilter) {
    query = query.in("id", houseFilter);
  }

  const { data: houses } = await query;

  const housesWithOccupancy = (houses ?? []).map((house) => {
    let totalBeds = 0;
    let occupiedBeds = 0;
    for (const room of house.rooms ?? []) {
      for (const bed of room.beds ?? []) {
        totalBeds++;
        const hasActive = (bed.bed_assignments ?? []).some(
          (ba: { end_date: string | null }) => !ba.end_date
        );
        if (hasActive) occupiedBeds++;
      }
    }
    return { ...house, totalBeds, occupiedBeds };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Houses</h1>
          <p className="text-muted-foreground">
            Manage your sober living houses
          </p>
        </div>
        {user.role === "admin" && <CreateHouseDialog />}
      </div>

      {housesWithOccupancy.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Home className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              No houses yet.{" "}
              {user.role === "admin" && "Create your first house to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {housesWithOccupancy.map((house) => (
            <Link key={house.id} href={`/houses/${house.id}`}>
              <Card className="hover:bg-muted/50 transition-colors h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{house.name}</CardTitle>
                    <Badge variant="outline">
                      {house.occupiedBeds}/{house.totalBeds} beds
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {house.address && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {house.address}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${house.totalBeds > 0 ? (house.occupiedBeds / house.totalBeds) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {house.totalBeds > 0
                        ? Math.round(
                            (house.occupiedBeds / house.totalBeds) * 100
                          )
                        : 0}
                      %
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
