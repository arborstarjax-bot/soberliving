import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardCheck } from "lucide-react";
import { CreateChoreDialog } from "./create-chore-dialog";
import { StartRotationDialog } from "./start-rotation-dialog";
import { RotationBoard } from "./rotation-board";
import { ChoreListManager } from "./chore-list-manager";
import { SignoffReviewList } from "./signoff-review-list";
import { ResidentChoreView } from "./resident-chore-view";
import { MissedChoresList } from "./missed-chores-list";
import { generateMissedChoreDemerits } from "../discipline/actions";

export default async function ChoresPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  const isStaff = user.role === "admin" || user.role === "manager";

  // Get houses
  let housesQuery = supabase
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) housesQuery = housesQuery.in("id", houseFilter);
  const { data: houses } = await housesQuery;

  // Get chores with tasks for all accessible houses
  let choresQuery = supabase
    .from("chores")
    .select("*, chore_tasks(*), days_of_week, cycle_weeks")
    .eq("is_active", true)
    .order("sort_order");
  if (houseFilter) choresQuery = choresQuery.in("house_id", houseFilter);
  const { data: chores } = await choresQuery;

  // Get current rotations
  let rotationsQuery = supabase
    .from("chore_rotations")
    .select(
      "*, chore_rotation_assignments(*, chore:chores(id, name, days_of_week, cycle_weeks), resident:residents(id, full_name), chore_signoffs(*))"
    )
    .eq("is_current", true);
  if (houseFilter) rotationsQuery = rotationsQuery.in("house_id", houseFilter);
  const { data: rotations } = await rotationsQuery;

  // Get residents for assignment
  let residentsQuery = supabase
    .from("residents")
    .select("id, full_name, house_id")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);
  const { data: residents } = await residentsQuery;

  // Get chore exclusions
  const { data: exclusions } = await supabase
    .from("chore_exclusions")
    .select("id, chore_id, resident_id, reason, resident:residents(full_name)");

  // Normalize exclusions: Supabase returns joined resident as array, flatten to object
  // Also filter by house access using the already-fetched chores list
  const accessibleChoreIds = new Set((chores ?? []).map((c) => c.id));
  const normalizedExclusions = (exclusions ?? [])
    .filter((e) => accessibleChoreIds.has(e.chore_id))
    .map((e) => ({
      ...e,
      resident: Array.isArray(e.resident) ? e.resident[0] ?? null : e.resident,
    }));

  // Auto-enforce missed chores (staff only, runs on page load)
  if (isStaff) {
    try {
      await generateMissedChoreDemerits();
    } catch {
      // Non-critical — don't block page render
    }
  }

  // Get signoffs needing review (include photo_url and completion_note)
  const pendingSignoffsQuery = supabase
    .from("chore_signoffs")
    .select(
      "*, rotation_assignment:chore_rotation_assignments(resident:residents(full_name), chore:chores(name, house_id))"
    )
    .eq("status", "completed_pending_review")
    .order("sign_off_date", { ascending: true });
  const { data: pendingSignoffs } = await pendingSignoffsQuery;

  // Get missed signoffs for the Missed tab
  let missedSignoffsQuery = supabase
    .from("chore_signoffs")
    .select(
      "*, rotation_assignment:chore_rotation_assignments(resident:residents(full_name), chore:chores(name, house_id))"
    )
    .eq("status", "missed")
    .order("sign_off_date", { ascending: false })
    .limit(100);
  const { data: missedSignoffs } = await missedSignoffsQuery;

  // Filter missed signoffs by house access
  let filteredMissedSignoffs = missedSignoffs ?? [];
  if (houseFilter) {
    filteredMissedSignoffs = filteredMissedSignoffs.filter((s) => {
      const ra = s.rotation_assignment as {
        chore: { house_id: string };
      };
      return houseFilter.includes(ra?.chore?.house_id);
    });
  }

  // Filter pending signoffs by house access
  let filteredPendingSignoffs = pendingSignoffs ?? [];
  if (houseFilter) {
    filteredPendingSignoffs = filteredPendingSignoffs.filter((s) => {
      const ra = s.rotation_assignment as {
        chore: { house_id: string };
      };
      return houseFilter.includes(ra?.chore?.house_id);
    });
  }

  // Get the current user's resident record if they are a resident
  let userResidentId: string | null = null;
  let userForcePhoto = false;
  let myAssignments: typeof rotations = null;

  if (user.role === "resident") {
    const { data: resident } = await supabase
      .from("residents")
      .select("id, force_photo")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (resident) {
      userResidentId = resident.id;
      userForcePhoto = resident.force_photo ?? false;
      const { data } = await supabase
        .from("chore_rotations")
        .select(
          "*, chore_rotation_assignments!inner(*, chore:chores(id, name, days_of_week, cycle_weeks, chore_tasks(*)), resident:residents(id, full_name), chore_signoffs(*))"
        )
        .eq("is_current", true)
        .eq(
          "chore_rotation_assignments.resident_id",
          resident.id
        );
      myAssignments = data;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chores</h1>
          <p className="text-muted-foreground">
            Chore rotation · Current week view
          </p>
        </div>
        {isStaff && (
          <div className="flex gap-2">
            <CreateChoreDialog houses={houses ?? []} />
            <StartRotationDialog houses={houses ?? []} />
          </div>
        )}
      </div>

      {user.role === "resident" ? (
        // Resident view: show their chore and signoff grid
        <ResidentChoreView rotations={myAssignments ?? []} userResidentId={userResidentId} forcePhoto={userForcePhoto} />
      ) : (
        // Staff view: tabs for rotation board, review, and chore management
        <Tabs defaultValue="rotation">
          <TabsList>
            <TabsTrigger value="rotation">Current Rotation</TabsTrigger>
            <TabsTrigger value="review">
              Needs Review
              {filteredPendingSignoffs.length > 0 && (
                <Badge
                  variant="default"
                  className="ml-1.5 text-[10px] px-1.5 py-0"
                >
                  {filteredPendingSignoffs.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="chore-list">Chore Lists</TabsTrigger>
            <TabsTrigger value="missed">
              Missed
              {filteredMissedSignoffs.length > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-1.5 text-[10px] px-1.5 py-0"
                >
                  {filteredMissedSignoffs.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rotation" className="mt-4">
            {(rotations ?? []).length > 0 ? (
              <div className="space-y-6">
                {(rotations ?? []).map((rotation) => {
                  const house = (houses ?? []).find(
                    (h) => h.id === rotation.house_id
                  );
                  const houseChores = (chores ?? []).filter(
                    (c) => c.house_id === rotation.house_id
                  );
                  const houseResidents = (residents ?? []).filter(
                    (r) => r.house_id === rotation.house_id
                  );

                  return (
                    <RotationBoard
                      key={rotation.id}
                      rotation={rotation}
                      houseName={house?.name ?? "Unknown"}
                      chores={houseChores}
                      residents={houseResidents}
                      assignments={rotation.chore_rotation_assignments ?? []}
                      isStaff={isStaff}
                      userRole={user.role}
                      userResidentId={userResidentId}
                    />
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">
                    No active rotation. Start a new rotation to begin
                    assigning chores.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="review" className="mt-4">
            <SignoffReviewList signoffs={filteredPendingSignoffs} />
          </TabsContent>

          <TabsContent value="chore-list" className="mt-4">
            <ChoreListManager
              houses={houses ?? []}
              chores={(chores ?? []).map((c) => ({
                ...c,
                tasks: (c.chore_tasks ?? [])
                  .filter((t: { is_active: boolean }) => t.is_active)
                  .sort(
                    (a: { sort_order: number }, b: { sort_order: number }) =>
                      a.sort_order - b.sort_order
                  ),
              }))}
              residents={residents ?? []}
              exclusions={normalizedExclusions}
            />
          </TabsContent>

          <TabsContent value="missed" className="mt-4">
            <MissedChoresList signoffs={filteredMissedSignoffs} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
