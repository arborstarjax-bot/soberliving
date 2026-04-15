import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DisciplineBoard } from "./discipline-board";
import { DemeritManager } from "./demerit-manager";

export default async function DisciplinePage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  // Get houses
  let housesQuery = supabase
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) housesQuery = housesQuery.in("id", houseFilter);
  const { data: houses } = await housesQuery;

  // For residents, determine their house
  let userHouseId: string | undefined;
  if (user.role === "resident" || user.is_resident) {
    const { data: myResident } = await supabase
      .from("residents")
      .select("id, house_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    userHouseId = myResident?.house_id;
  }

  // For residents, only show their own house
  const visibleHouses = user.role === "resident"
    ? (houses ?? []).filter((h) => h.id === userHouseId)
    : houses ?? [];

  // Get all residents for visible houses
  const houseIds = visibleHouses.map((h) => h.id);
  const { data: residents } = houseIds.length > 0
    ? await supabase
        .from("residents")
        .select("id, full_name, house_id, move_in_date, status")
        .in("house_id", houseIds)
        .eq("status", "active")
        .order("full_name")
    : { data: [] };

  // Get all demerits for visible houses
  const { data: demerits } = houseIds.length > 0
    ? await supabase
        .from("demerits")
        .select("*")
        .in("house_id", houseIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">House Discipline</h1>
        <p className="text-muted-foreground">
          Track demerits and accountability across houses
        </p>
      </div>

      {visibleHouses.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No houses to display
        </p>
      ) : (
        <Tabs defaultValue={visibleHouses[0]?.id}>
          <TabsList className="flex-wrap">
            {visibleHouses.map((h) => (
              <TabsTrigger key={h.id} value={h.id}>
                {h.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {visibleHouses.map((house) => {
            const houseResidents = (residents ?? []).filter(
              (r) => r.house_id === house.id
            );
            const houseDemerits = (demerits ?? []).filter(
              (d) => d.house_id === house.id
            );

            return (
              <TabsContent key={house.id} value={house.id} className="mt-4 space-y-6">
                {/* Grid-style discipline board */}
                <DisciplineBoard
                  residents={houseResidents}
                  demerits={houseDemerits}
                  houseName={house.name}
                />

                {/* Demerit management for admins/managers */}
                {(user.role === "admin" || user.role === "manager") && (
                  <DemeritManager
                    houseId={house.id}
                    houseName={house.name}
                    residents={houseResidents}
                    demerits={houseDemerits}
                    userRole={user.role}
                  />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
