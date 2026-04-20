import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedActiveHouses } from "@/lib/cached-dropdowns";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import { RotationBoard } from "./rotation-board";
import { ChoreListManager } from "./chore-list-manager";
import { SignoffReviewList } from "./signoff-review-list";
import { ResidentChoreView } from "./resident-chore-view";
import { MissedChoresList } from "./missed-chores-list";
import { generateMissedChoreDemerits } from "../discipline/actions";

/**
 * Entire Chores body (resident view OR staff tabs). Lives behind a
 * `<Suspense>` boundary on `page.tsx` so the header + Create /
 * Start-Rotation buttons paint immediately while the 6-way data
 * gather (houses / chores / rotations / residents / exclusions /
 * rooms / signoffs) streams in.
 *
 * Cursor pagination not applied here: rotation / chore-list /
 * missed views are all scoped per-house and are short lists by
 * design.  Historical signoffs are capped at 100 to bound the work
 * just like the previous behavior.
 */
export async function ChoresBodySection({
  user,
  selectedHouseId = null,
}: {
  user: SessionUser;
  selectedHouseId?: string | null;
}) {
  const supabase = await createClient();
  const accessibleHouseFilter = getAccessibleHouseFilter(user);
  const isStaff = user.role === "admin" || user.role === "manager";

  // When the staff user has picked a specific house via the URL
  // tab, scope every query to just that one. Otherwise fall back
  // to their normal accessible set (null = admin, every house).
  const houseFilter: string[] | null = selectedHouseId
    ? [selectedHouseId]
    : accessibleHouseFilter;

  // Auto-enforce missed chore demerits on staff page loads.  Kept
  // inside the section so it stays deferred along with the body.
  if (isStaff) {
    try {
      await generateMissedChoreDemerits();
    } catch {
      // Non-critical — don't block page render.
    }
  }

  let choresQuery = supabase
    .from("chores")
    .select("*, chore_tasks(*), days_of_week, cycle_weeks")
    .eq("is_active", true)
    .order("sort_order");
  if (houseFilter) choresQuery = choresQuery.in("house_id", houseFilter);

  let rotationsQuery = supabase
    .from("chore_rotations")
    .select(
      "*, chore_rotation_assignments(*, chore:chores(id, name, days_of_week, cycle_weeks), resident:residents(id, full_name), chore_signoffs(*))"
    )
    .eq("is_current", true);
  if (houseFilter) rotationsQuery = rotationsQuery.in("house_id", houseFilter);

  let residentsQuery = supabase
    .from("residents")
    .select("id, full_name, house_id")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);

  const exclusionsQuery = supabase
    .from("chore_exclusions")
    .select("id, chore_id, resident_id, reason, resident:residents(full_name)");

  let roomsQuery = supabase
    .from("rooms")
    .select("id, house_id, name")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) roomsQuery = roomsQuery.in("house_id", houseFilter);

  const roomExclusionsQuery = supabase
    .from("chore_room_exclusions")
    .select("id, chore_id, room_id");

  const pendingSignoffsQuery = supabase
    .from("chore_signoffs")
    .select(
      "*, rotation_assignment:chore_rotation_assignments(resident:residents(full_name), chore:chores(name, house_id))"
    )
    .eq("status", "completed_pending_review")
    .order("sign_off_date", { ascending: true });

  const missedSignoffsQuery = supabase
    .from("chore_signoffs")
    .select(
      "*, rotation_assignment:chore_rotation_assignments(resident:residents(full_name), chore:chores(name, house_id))"
    )
    .eq("status", "missed")
    .order("sign_off_date", { ascending: false })
    .limit(100);

  const [
    allHouses,
    { data: chores },
    { data: rotations },
    { data: residents },
    { data: exclusions },
    { data: rooms },
    { data: roomExclusions },
    { data: pendingSignoffs },
    { data: missedSignoffs },
  ] = await Promise.all([
    getCachedActiveHouses(),
    choresQuery,
    rotationsQuery,
    residentsQuery,
    exclusionsQuery,
    roomsQuery,
    roomExclusionsQuery,
    pendingSignoffsQuery,
    missedSignoffsQuery,
  ]);

  const houses = houseFilter
    ? allHouses.filter((h) => houseFilter.includes(h.id))
    : allHouses;

  const accessibleChoreIds = new Set((chores ?? []).map((c) => c.id));
  const normalizedExclusions = (exclusions ?? [])
    .filter((e) => accessibleChoreIds.has(e.chore_id))
    .map((e) => ({
      ...e,
      resident: Array.isArray(e.resident) ? e.resident[0] ?? null : e.resident,
    }));

  let filteredMissedSignoffs = missedSignoffs ?? [];
  if (houseFilter) {
    filteredMissedSignoffs = filteredMissedSignoffs.filter((s) => {
      const ra = s.rotation_assignment as { chore: { house_id: string } };
      return houseFilter.includes(ra?.chore?.house_id);
    });
  }

  let filteredPendingSignoffs = pendingSignoffs ?? [];
  if (houseFilter) {
    filteredPendingSignoffs = filteredPendingSignoffs.filter((s) => {
      const ra = s.rotation_assignment as { chore: { house_id: string } };
      return houseFilter.includes(ra?.chore?.house_id);
    });
  }

  // Resident view branch
  if (user.role === "resident") {
    let userResidentId: string | null = null;
    let userForcePhoto = false;
    let myAssignments: typeof rotations = null;

    const { data: resident } = await supabase
      .from("residents")
      .select("id, force_photo")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (resident) {
      userResidentId = resident.id;
      userForcePhoto = resident.force_photo ?? false;
      const { data } = await supabase
        .from("chore_rotations")
        .select(
          "*, chore_rotation_assignments!inner(*, chore:chores(id, name, days_of_week, cycle_weeks, chore_tasks(*)), resident:residents(id, full_name), chore_signoffs(*))"
        )
        .eq("is_current", true)
        .eq("chore_rotation_assignments.resident_id", resident.id);
      myAssignments = data;
    }

    return (
      <ResidentChoreView
        rotations={myAssignments ?? []}
        userResidentId={userResidentId}
        forcePhoto={userForcePhoto}
      />
    );
  }

  // Staff view branch
  return (
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
                  userResidentId={null}
                />
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                No active rotation. Start a new rotation to begin assigning
                chores.
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
          rooms={rooms ?? []}
          roomExclusions={(roomExclusions ?? []).filter((re) =>
            accessibleChoreIds.has(re.chore_id)
          )}
        />
      </TabsContent>

      <TabsContent value="missed" className="mt-4">
        <MissedChoresList
          signoffs={filteredMissedSignoffs}
          canAct={isStaff}
        />
      </TabsContent>
    </Tabs>
  );
}
