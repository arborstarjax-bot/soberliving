import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateMilestones, getDaysSober } from "@/lib/milestones";
import { ResidentTimeline } from "./timeline";
import { ResidentNotes } from "./notes";
import { ForcePhotoToggle } from "./force-photo-toggle";
import { EditResidentForm } from "./edit-resident-form";
import { DischargeDialog } from "./discharge-dialog";
import { DocumentsList } from "@/components/documents-list";

export default async function ResidentDetailPage(
  props: PageProps<"/residents/[id]">
) {
  const { id } = await props.params;
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: resident } = await supabase
    .from("residents")
    .select("*, houses(id, name)")
    .eq("id", id)
    .single();

  if (!resident) redirect("/residents");

  if (
    user.role !== "admin" &&
    user.role !== "resident" &&
    !canAccessHouse(user, resident.house_id)
  ) {
    redirect("/dashboard");
  }

  // Bed assignments
  const { data: bedAssignments } = await supabase
    .from("bed_assignments")
    .select("*, bed:beds(label, room:rooms(name))")
    .eq("resident_id", id)
    .order("start_date", { ascending: false });

  // Chore rotation assignments
  const { data: choreAssignments } = await supabase
    .from("chore_rotation_assignments")
    .select("*, chore:chores(name), rotation:chore_rotations(cycle_start_date, cycle_end_date, is_current), chore_signoffs(*)")
    .eq("resident_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Incidents
  const { data: incidents } = await supabase
    .from("incidents")
    .select("*")
    .eq("resident_id", id)
    .order("occurred_at", { ascending: false });

  // Leave requests
  const { data: leaveRequests } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("resident_id", id)
    .order("created_at", { ascending: false });

  // Notes (staff only)
  const { data: notes } = await supabase
    .from("resident_notes")
    .select("*, author:users(full_name)")
    .eq("resident_id", id)
    .order("created_at", { ascending: false });

  // Active restrictions
  const { data: restrictions } = await supabase
    .from("restrictions")
    .select("*")
    .eq("resident_id", id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  // Activity log
  const { data: activity } = await supabase
    .from("activity_log")
    .select("*")
    .eq("resident_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Documents (linked via user_id)
  const { data: documents } = resident.user_id
    ? await supabase
        .from("documents")
        .select("*")
        .eq("user_id", resident.user_id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const milestones = resident.sobriety_date
    ? calculateMilestones(resident.sobriety_date)
    : [];

  const activeBeds = (bedAssignments ?? []).filter((ba) => !ba.end_date);
  const isStaff = user.role === "admin" || user.role === "manager";
  const canEdit = user.role === "admin" || (user.role === "manager" && canAccessHouse(user, resident.house_id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{resident.full_name}</h1>
          <p className="text-muted-foreground">
            {(resident.houses as unknown as { name: string } | null)?.name} ·{" "}
            <Badge variant="outline" className="capitalize">
              {resident.status}
            </Badge>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <EditResidentForm
              residentId={id}
              resident={{
                full_name: resident.full_name,
                phone: resident.phone ?? null,
                email: resident.email ?? null,
                date_of_birth: resident.date_of_birth ?? null,
                sobriety_date: resident.sobriety_date ?? null,
                move_in_date: resident.move_in_date,
                emergency_contact_name: resident.emergency_contact_name ?? null,
                emergency_contact_phone: resident.emergency_contact_phone ?? null,
                emergency_contact_relationship: resident.emergency_contact_relationship ?? null,
                notes: resident.notes ?? null,
              }}
            />
          )}
          {isStaff && (
            <DischargeDialog
              residentId={id}
              status={resident.status}
            />
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Room / Bed</CardTitle>
          </CardHeader>
          <CardContent>
            {activeBeds.length > 0 ? (
              activeBeds.map((ba) => (
                <p key={ba.id} className="text-sm">
                  {(ba.bed as { room: { name: string } })?.room?.name} —{" "}
                  {(ba.bed as { label: string })?.label}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Unassigned</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Move-in</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {new Date(resident.move_in_date).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sobriety</CardTitle>
          </CardHeader>
          <CardContent>
            {resident.sobriety_date ? (
              <div>
                <p className="text-lg font-bold">
                  {getDaysSober(resident.sobriety_date)} days
                </p>
                <p className="text-xs text-muted-foreground">
                  Since{" "}
                  {new Date(resident.sobriety_date).toLocaleDateString()}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not set</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Contact</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {resident.phone && <p>{resident.phone}</p>}
            {resident.email && <p>{resident.email}</p>}
            {!resident.phone && !resident.email && (
              <p className="text-muted-foreground">No contact info</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Milestones */}
      {milestones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sobriety Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {milestones.map((m) => (
                <Badge
                  key={m.label}
                  variant={m.reached ? "default" : "outline"}
                  className={m.reached ? "" : "opacity-40"}
                >
                  {m.label}
                  {m.reached && " ✓"}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="chores">
            Chores ({choreAssignments?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="incidents">
            Incidents ({incidents?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="leave">
            Leave ({leaveRequests?.length ?? 0})
          </TabsTrigger>
          {isStaff && (
            <TabsTrigger value="notes">
              Notes ({notes?.length ?? 0})
            </TabsTrigger>
          )}
          <TabsTrigger value="documents">
            Documents ({documents?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <ResidentTimeline activity={activity ?? []} />
        </TabsContent>

        <TabsContent value="chores" className="mt-4">
          {choreAssignments && choreAssignments.length > 0 ? (
            <div className="space-y-2">
              {choreAssignments.map((ca) => {
                const signoffs = (ca.chore_signoffs as unknown as Array<{ status: string }>) ?? [];
                const approved = signoffs.filter((s) => s.status === "approved").length;
                const total = signoffs.length;
                const rotation = ca.rotation as unknown as { cycle_start_date: string; cycle_end_date: string; is_current: boolean } | null;
                return (
                  <Card key={ca.id}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">
                          {(ca.chore as { name: string })?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rotation
                            ? `${new Date(rotation.cycle_start_date).toLocaleDateString()} — ${new Date(rotation.cycle_end_date).toLocaleDateString()}`
                            : ""}
                          {total > 0 && ` · ${approved}/${total} signed off`}
                        </p>
                      </div>
                      <Badge
                        variant={rotation?.is_current ? "default" : "outline"}
                      >
                        {rotation?.is_current ? "Current" : "Past"}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              No chore assignments
            </p>
          )}
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          {incidents && incidents.length > 0 ? (
            <div className="space-y-2">
              {incidents.map((inc) => (
                <Card key={inc.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between mb-1">
                      <Badge
                        variant={
                          inc.severity === "critical"
                            ? "destructive"
                            : inc.severity === "major"
                              ? "secondary"
                              : "outline"
                        }
                        className="capitalize"
                      >
                        {inc.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(inc.occurred_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{inc.description}</p>
                    {inc.category && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Category: {inc.category}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              No incidents
            </p>
          )}
        </TabsContent>

        <TabsContent value="leave" className="mt-4">
          {leaveRequests && leaveRequests.length > 0 ? (
            <div className="space-y-2">
              {leaveRequests.map((lr) => (
                <Card key={lr.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm">
                        {new Date(lr.departure_date).toLocaleDateString()} →{" "}
                        {new Date(
                          lr.expected_return_date
                        ).toLocaleDateString()}
                      </p>
                      {lr.reason && (
                        <p className="text-xs text-muted-foreground">
                          {lr.reason}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        lr.status === "denied"
                          ? "destructive"
                          : lr.status === "approved"
                            ? "default"
                            : "outline"
                      }
                      className="capitalize"
                    >
                      {lr.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              No leave requests
            </p>
          )}
        </TabsContent>

        {isStaff && (
          <TabsContent value="notes" className="mt-4">
            <ResidentNotes
              residentId={id}
              notes={notes ?? []}
              userRole={user.role}
            />
          </TabsContent>
        )}

        <TabsContent value="documents" className="mt-4">
          <DocumentsList documents={documents ?? []} />
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {isStaff && (
                <div className="border rounded-md p-4 bg-muted/30">
                  <ForcePhotoToggle
                    residentId={id}
                    initialValue={resident.force_photo ?? false}
                  />
                  <p className="text-xs text-muted-foreground mt-1 ml-7">
                    When enabled, this resident must upload a photo before signing off on chores.
                  </p>
                </div>
              )}

              {/* Active Restrictions */}
              {(restrictions ?? []).length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-2">Active Restrictions</p>
                  <div className="space-y-2">
                    {(restrictions ?? []).map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-sm border border-red-200 rounded-md p-2 bg-red-50">
                        <div>
                          <span className="font-medium capitalize">{r.restriction_type.replace("_", " ")}</span>
                          {r.is_house_commitment && (
                            <Badge variant="secondary" className="ml-2 text-xs">New Intake</Badge>
                          )}
                          <p className="text-xs text-muted-foreground">{r.description}</p>
                          {r.notes && <p className="text-xs text-muted-foreground italic">Note: {r.notes}</p>}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {r.end_date
                            ? `Until ${new Date(r.end_date).toLocaleDateString()}`
                            : "Indefinite"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Date of Birth</p>
                  <p>
                    {resident.date_of_birth
                      ? new Date(resident.date_of_birth).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p>{resident.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p>{resident.email || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Move-out Date</p>
                  <p>
                    {resident.move_out_date
                      ? new Date(
                          resident.move_out_date
                        ).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
                {resident.discharge_reason && (
                  <div className="sm:col-span-2">
                    <p className="text-sm text-muted-foreground">Discharge Reason</p>
                    <p className="text-sm">{resident.discharge_reason}</p>
                  </div>
                )}
              </div>
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-1">
                  Emergency Contact
                </p>
                <p className="font-medium">
                  {resident.emergency_contact_name}
                </p>
                <p className="text-sm">{resident.emergency_contact_phone}</p>
                {resident.emergency_contact_relationship && (
                  <p className="text-xs text-muted-foreground">
                    {resident.emergency_contact_relationship}
                  </p>
                )}
              </div>
              {resident.notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-1">
                    Intake Notes
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {resident.notes}
                  </p>
                </div>
              )}

              {/* Bed assignment history */}
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Bed Assignment History
                </p>
                {bedAssignments && bedAssignments.length > 0 ? (
                  <div className="space-y-2">
                    {bedAssignments.map((ba) => (
                      <div
                        key={ba.id}
                        className="flex items-center justify-between text-sm border rounded-md p-2"
                      >
                        <span>
                          {(ba.bed as { room: { name: string } })?.room?.name}{" "}
                          / {(ba.bed as { label: string })?.label}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(ba.start_date).toLocaleDateString()}
                          {ba.end_date
                            ? ` — ${new Date(ba.end_date).toLocaleDateString()}`
                            : " — Present"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No bed assignments
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
