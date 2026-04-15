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
    .select("*, chore_tasks(*)")
    .eq("is_active", true)
    .order("sort_order");
  if (houseFilter) choresQuery = choresQuery.in("house_id", houseFilter);
  const { data: chores } = await choresQuery;

  // Get current rotations
  let rotationsQuery = supabase
    .from("chore_rotations")
    .select(
      "*, chore_rotation_assignments(*, chore:chores(id, name), resident:residents(id, full_name), chore_signoffs(*))"
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

  // Get signoffs needing review
  const pendingSignoffsQuery = supabase
    .from("chore_signoffs")
    .select(
      "*, rotation_assignment:chore_rotation_assignments(resident:residents(full_name), chore:chores(name, house_id))"
    )
    .eq("status", "completed_pending_review")
    .order("sign_off_date", { ascending: true });
  const { data: pendingSignoffs } = await pendingSignoffsQuery;

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

  // For residents, get their own assignments
  let myAssignments: typeof rotations = null;
  if (user.role === "resident") {
    const { data: resident } = await supabase
      .from("residents")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (resident) {
      const { data } = await supabase
        .from("chore_rotations")
        .select(
          "*, chore_rotation_assignments!inner(*, chore:chores(id, name, chore_tasks(*)), resident:residents(id, full_name), chore_signoffs(*))"
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
            2-week rotation cycle · Mon / Wed / Fri
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
        <ResidentChoreView rotations={myAssignments ?? []} />
      ) : (
        // Staff view: tabs for rotation board, review, and chore management
        <Tabs defaultValue="rotation">
          <TabsList>
            <TabsTrigger value="rotation">Current Rotation</TabsTrigger>
            <TabsTrigger value="review">
              Needs Review ({filteredPendingSignoffs.length})
            </TabsTrigger>
            <TabsTrigger value="chore-list">Chore Lists</TabsTrigger>
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
                      exclusions={exclusions ?? []}
                    />
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">
                    No active rotation. Start a new 2-week rotation to begin
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
              exclusions={exclusions ?? []}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ResidentChoreView({
  rotations,
}: {
  rotations: Array<{
    id: string;
    cycle_start_date: string;
    cycle_end_date: string;
    chore_rotation_assignments: Array<{
      id: string;
      chore: { id: string; name: string; chore_tasks: Array<{ id: string; description: string; sort_order: number; is_active: boolean }> };
      chore_signoffs: Array<{
        id: string;
        day_of_week: string;
        week_number: number;
        status: string;
        sign_off_date: string;
      }>;
    }>;
  }>;
}) {
  if (rotations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No chores assigned to you this cycle.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {rotations.map((rotation) =>
        rotation.chore_rotation_assignments.map((assignment) => (
          <Card key={assignment.id}>
            <CardHeader>
              <CardTitle>{assignment.chore.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {new Date(rotation.cycle_start_date).toLocaleDateString()} —{" "}
                {new Date(rotation.cycle_end_date).toLocaleDateString()}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Task checklist */}
              {assignment.chore.chore_tasks
                ?.filter((t) => t.is_active)
                .sort((a, b) => a.sort_order - b.sort_order)
                .length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Tasks:</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                    {assignment.chore.chore_tasks
                      .filter((t) => t.is_active)
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((task) => (
                        <li key={task.id}>{task.description}</li>
                      ))}
                  </ol>
                </div>
              )}

              {/* Signoff grid */}
              <div>
                <p className="text-sm font-medium mb-2">Sign-off Tracking:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead>
                      <tr>
                        <th className="border p-2 text-left bg-muted" />
                        <th className="border p-2 text-center bg-muted" colSpan={3}>
                          Week 1
                        </th>
                        <th className="border p-2 text-center bg-muted" colSpan={3}>
                          Week 2
                        </th>
                      </tr>
                      <tr>
                        <th className="border p-2 text-left bg-muted/50">Day</th>
                        {["Mon", "Wed", "Fri", "Mon", "Wed", "Fri"].map(
                          (d, i) => (
                            <th
                              key={i}
                              className="border p-2 text-center bg-muted/50"
                            >
                              {d}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border p-2 font-medium">
                          {assignment.chore.name}
                        </td>
                        {[1, 2].flatMap((week) =>
                          (["monday", "wednesday", "friday"] as const).map(
                            (day) => {
                              const signoff =
                                assignment.chore_signoffs.find(
                                  (s) =>
                                    s.week_number === week &&
                                    s.day_of_week === day
                                );
                              return (
                                <td
                                  key={`${week}-${day}`}
                                  className="border p-2 text-center"
                                >
                                  {signoff ? (
                                    <SignoffCell
                                      signoff={signoff}
                                    />
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              );
                            }
                          )
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function SignoffCell({
  signoff,
}: {
  signoff: { id: string; status: string; sign_off_date: string };
}) {
  const today = new Date().toISOString().split("T")[0];
  const isFuture = signoff.sign_off_date > today;

  if (signoff.status === "approved") {
    return <Badge variant="default" className="text-xs">✓</Badge>;
  }
  if (signoff.status === "completed_pending_review") {
    return <Badge variant="secondary" className="text-xs">Review</Badge>;
  }
  if (signoff.status === "rejected") {
    return <Badge variant="destructive" className="text-xs">Redo</Badge>;
  }
  if (signoff.status === "missed") {
    return <Badge variant="destructive" className="text-xs">Missed</Badge>;
  }
  if (isFuture) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <Badge variant="outline" className="text-xs">Pending</Badge>;
}
