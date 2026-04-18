import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  calculateMilestones,
  getDaysSober,
  isSobrietyDateFuture,
} from "@/lib/milestones";
import { formatDateOnly, getHouseToday } from "@/lib/timezone";
import { ResidentTimeline } from "./timeline";
import { ResidentNotes } from "./notes";
import { ForcePhotoToggle } from "./force-photo-toggle";
import { EditResidentForm } from "./edit-resident-form";
import { DischargeDialog } from "./discharge-dialog";
import { ChangeBedDialog, type BedOption } from "./change-bed-dialog";
import { DocumentsList } from "@/components/documents-list";
import { ResidentPaymentsPanel } from "./payments-panel";

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

  // Chore rotation assignments — only current cycles. Past rotations
  // are noise in the resident's profile; the /chores calendar is the
  // place to go back through history.
  const { data: choreAssignmentsRaw } = await supabase
    .from("chore_rotation_assignments")
    .select("*, chore:chores(name), rotation:chore_rotations!inner(cycle_start_date, cycle_end_date, is_current), chore_signoffs(*)")
    .eq("resident_id", id)
    .eq("rotation.is_current", true)
    .order("created_at", { ascending: false });
  const choreAssignments = choreAssignmentsRaw ?? [];

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

  // Active commitment — source of truth for payment terms (rent,
  // admin fee, due day). Pulled first so we can backfill any missing
  // charges BEFORE we read them, otherwise the first page load shows
  // "No open charges" until a second refresh.
  const { data: activeCommitment } = await supabase
    .from("house_commitments")
    .select(
      "id, rent_amount, admin_fee, commitment_start_date, status, pdf_storage_path"
    )
    .eq("resident_id", id)
    .eq("status", "active")
    .order("commitment_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Pending payment-terms amendment awaiting resident signature. Shown
  // as a callout on the Payment Terms card so admins don't propose a
  // second amendment while one is in flight (the DB unique index
  // prevents it, but the callout gives them a clearer reason).
  const { data: pendingAmendment } = resident.user_id
    ? await supabase
        .from("house_commitments")
        .select(
          "id, rent_amount, admin_fee, effective_date, amendment_reason, created_at, parent_commitment_id"
        )
        .eq("user_id", resident.user_id)
        .eq("status", "pending_resident_signature")
        .not("parent_commitment_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  // Pending INITIAL commitment (never signed). Distinct from an
  // amendment — parent_commitment_id is null. Shows up when the admin
  // ran intake review but the resident hasn't signed yet. Surfaces an
  // Edit/Resend/Mark Complete control set so staff don't have to
  // bounce back to Intake Review.
  const { data: pendingInitialCommitment } = resident.user_id
    ? await supabase
        .from("house_commitments")
        .select(
          "id, rent_amount, admin_fee, payment_frequency, commitment_start_date, commitment_term, rent_due_date, notes, created_at"
        )
        .eq("user_id", resident.user_id)
        .eq("status", "pending_resident_signature")
        .is("parent_commitment_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  // Backfill-on-view: open any missing admin_fee / rent charges for
  // this commitment. Residents activated before the intake-review
  // opener was wired up have commitments but zero charges; this
  // lazily seeds them the first time an admin opens their profile.
  // Idempotent — the unique index blocks duplicates.
  if (activeCommitment?.id) {
    try {
      const { openAllChargesForCommitment } = await import(
        "@/lib/payments/charges"
      );
      await openAllChargesForCommitment(activeCommitment.id as string);
    } catch (e) {
      console.error("Charge backfill failed on resident detail load", e);
    }
  }

  // Open charges + recent payments for this resident. Pulled here so
  // the Payments tab and the "Next Due" header tile on this page both
  // render off the same data without a second round trip.
  const { data: residentOpenCharges } = await supabase
    .from("payment_charges")
    .select(
      "id, charge_type, amount, paid_amount, due_date, period_start, period_end, status"
    )
    .eq("resident_id", id)
    .in("status", ["open", "partial"])
    .order("due_date", { ascending: true });

  const { data: residentRecentPayments } = await supabase
    .from("payments")
    .select(
      "id, amount, payment_type, payment_method, paid_at, status, receipt_number, receipt_storage_path, note"
    )
    .eq("resident_id", id)
    .order("paid_at", { ascending: false })
    .limit(100);

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

  // Activity log — pull a large window; the client Timeline pages
  // through this in chunks of 20.
  const { data: activity } = await supabase
    .from("activity_log")
    .select("*")
    .eq("resident_id", id)
    .order("created_at", { ascending: false })
    .limit(500);

  // Documents (linked via user_id)
  const { data: documents } = resident.user_id
    ? await supabase
        .from("documents")
        .select("*")
        .eq("user_id", resident.user_id)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Fetch user role (for role editing by admin)
  let residentRole: string | null = null;
  if (resident.user_id) {
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", resident.user_id)
      .maybeSingle();
    residentRole = roleData?.role ?? null;
  }

  // Fetch all houses + manager house assignments (for role editing)
  const { data: allHouses } = await supabase
    .from("houses")
    .select("id, name")
    .order("name");

  let assignedHouseIds: string[] = [];
  if (resident.user_id) {
    const { data: assignments } = await supabase
      .from("manager_house_assignments")
      .select("house_id")
      .eq("user_id", resident.user_id)
      .is("unassigned_at", null);
    assignedHouseIds = (assignments ?? []).map((a) => a.house_id);
  }

  const milestones = resident.sobriety_date
    ? calculateMilestones(resident.sobriety_date)
    : [];

  const activeBeds = (bedAssignments ?? []).filter((ba) => !ba.end_date);
  const isStaff = user.role === "admin" || user.role === "manager";
  const canEdit = user.role === "admin" || (user.role === "manager" && canAccessHouse(user, resident.house_id));

  // Beds in resident's house for the Change Bed dialog
  let bedOptions: BedOption[] = [];
  if (canEdit && resident.status === "active") {
    const activeBedIds = new Set(activeBeds.map((ba) => ba.bed_id));
    const { data: houseBeds } = await supabase
      .from("beds")
      .select(
        "id, label, is_active, room:rooms!inner(name, house_id), bed_assignments(id, end_date)"
      )
      .eq("room.house_id", resident.house_id)
      .eq("is_active", true);
    bedOptions = ((houseBeds ?? []) as unknown as {
      id: string;
      label: string;
      room: { name: string } | null;
      bed_assignments: { end_date: string | null }[];
    }[])
      .map((b) => ({
        id: b.id,
        label: b.label,
        roomName: b.room?.name ?? "",
        isOccupied: (b.bed_assignments ?? []).some((ba) => ba.end_date === null),
        isCurrent: activeBedIds.has(b.id),
      }))
      .sort(
        (a, b) =>
          a.roomName.localeCompare(b.roomName) || a.label.localeCompare(b.label)
      );
  }

  const currentBedLabel =
    activeBeds.length > 0
      ? activeBeds
          .map(
            (ba) =>
              `${(ba.bed as { room: { name: string } })?.room?.name} — ${(ba.bed as { label: string })?.label}`
          )
          .join(", ")
      : null;

  // Outstanding balance = open/partial charges whose due date is today
  // or earlier. Future-dated charges (e.g. an existing-tenant first
  // rent scheduled for next month) are "upcoming", not outstanding.
  const todayIsoStr = getHouseToday();
  const outstandingTotal = (residentOpenCharges ?? [])
    .filter((c) => (c.due_date as string) <= todayIsoStr)
    .reduce((s, c) => s + (Number(c.amount) - Number(c.paid_amount)), 0);
  const upcomingCharges = (residentOpenCharges ?? []).filter(
    (c) => (c.due_date as string) > todayIsoStr
  );
  const nextUpcoming = upcomingCharges[0] ?? null;

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
                move_out_date: resident.move_out_date ?? null,
                emergency_contact_name: resident.emergency_contact_name ?? null,
                emergency_contact_phone: resident.emergency_contact_phone ?? null,
                emergency_contact_relationship: resident.emergency_contact_relationship ?? null,
                notes: resident.notes ?? null,
              }}
              userId={resident.user_id ?? null}
              currentRole={residentRole}
              isAdmin={user.role === "admin"}
              houses={(allHouses ?? []).map((h) => ({ id: h.id, name: h.name }))}
              assignedHouseIds={assignedHouseIds}
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

      {/* Outstanding balance — prominent at the top so staff see it
          before digging into the Payments tab. Shown on every active
          resident, including $0.00 cases so it's not visually jumpy. */}
      {resident.status === "active" && (
        <Card
          className={
            outstandingTotal > 0
              ? "border-amber-200 bg-amber-50"
              : "border-green-200 bg-green-50"
          }
        >
          <CardContent className="py-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Outstanding Balance
              </p>
              <p
                className={`text-2xl font-bold ${
                  outstandingTotal > 0 ? "text-amber-900" : "text-green-900"
                }`}
              >
                ${outstandingTotal.toFixed(2)}
              </p>
              {nextUpcoming && (
                <p className="text-xs text-muted-foreground mt-1">
                  Next charge: $
                  {Number(nextUpcoming.amount).toFixed(2)} due{" "}
                  {formatDateOnly(nextUpcoming.due_date as string)}
                </p>
              )}
            </div>
            <a
              href="#payments"
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              View all charges →
            </a>
          </CardContent>
        </Card>
      )}

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Room / Bed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeBeds.length > 0 ? (
              activeBeds.map((ba) => (
                <p key={ba.id} className="text-sm">
                  {(ba.bed as { room: { name: string } })?.room?.name} —{" "}
                  {(ba.bed as { label: string })?.label}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No specific bed assigned
              </p>
            )}
            {canEdit && resident.status === "active" && (
              <ChangeBedDialog
                residentId={id}
                houseId={resident.house_id}
                beds={bedOptions}
                currentBedLabel={currentBedLabel}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Move-in</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {formatDateOnly(resident.move_in_date)}
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
                  {isSobrietyDateFuture(resident.sobriety_date)
                    ? `Starts ${formatDateOnly(resident.sobriety_date)}`
                    : `Since ${formatDateOnly(resident.sobriety_date)}`}
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
          <TabsTrigger value="payments">
            Payments ({(residentOpenCharges ?? []).length})
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
                            ? `${formatDateOnly(rotation.cycle_start_date)} — ${formatDateOnly(rotation.cycle_end_date)}`
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
                        {formatDateOnly(inc.occurred_at)}
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

        <TabsContent value="payments" className="mt-4">
          <ResidentPaymentsPanel
            openCharges={residentOpenCharges ?? []}
            recentPayments={residentRecentPayments ?? []}
            canVoid={user.role === "admin"}
            terms={
              activeCommitment
                ? {
                    commitment_id: activeCommitment.id as string,
                    rent_amount: Number(activeCommitment.rent_amount ?? 0),
                    admin_fee:
                      activeCommitment.admin_fee !== null &&
                      activeCommitment.admin_fee !== undefined
                        ? Number(activeCommitment.admin_fee)
                        : null,
                    commitment_start_date:
                      activeCommitment.commitment_start_date as string,
                    pdf_storage_path:
                      (activeCommitment.pdf_storage_path as string | null) ??
                      null,
                  }
                : null
            }
            isAdmin={user.role === "admin"}
            residentUserId={resident.user_id ?? null}
            residentName={resident.full_name ?? ""}
            residentId={resident.id as string}
            houseId={(resident.house_id as string | null) ?? null}
            canRecordPayment={canEdit}
            pendingAmendment={
              pendingAmendment
                ? {
                    id: pendingAmendment.id as string,
                    rent_amount: Number(pendingAmendment.rent_amount ?? 0),
                    admin_fee:
                      pendingAmendment.admin_fee !== null &&
                      pendingAmendment.admin_fee !== undefined
                        ? Number(pendingAmendment.admin_fee)
                        : null,
                    effective_date:
                      (pendingAmendment.effective_date as string | null) ??
                      null,
                    amendment_reason:
                      (pendingAmendment.amendment_reason as string | null) ??
                      null,
                    created_at: pendingAmendment.created_at as string,
                  }
                : null
            }
            pendingInitialCommitment={
              pendingInitialCommitment
                ? {
                    id: pendingInitialCommitment.id as string,
                    paymentFrequency:
                      ((pendingInitialCommitment.payment_frequency as
                        | "weekly"
                        | "monthly"
                        | null) ?? "monthly"),
                    rentAmount: Number(
                      pendingInitialCommitment.rent_amount ?? 0
                    ),
                    adminFee: Number(
                      pendingInitialCommitment.admin_fee ?? 0
                    ),
                    commitmentStartDate:
                      (pendingInitialCommitment.commitment_start_date as string) ??
                      "",
                    commitmentTerm:
                      (pendingInitialCommitment.commitment_term as string) ??
                      "",
                    rentDueDate:
                      (pendingInitialCommitment.rent_due_date as
                        | string
                        | null) ?? null,
                    notes:
                      (pendingInitialCommitment.notes as string | null) ?? null,
                  }
                : null
            }
          />
        </TabsContent>

        <TabsContent value="leave" className="mt-4">
          {leaveRequests && leaveRequests.length > 0 ? (
            <div className="space-y-2">
              {leaveRequests.map((lr) => (
                <Card key={lr.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm">
                        {formatDateOnly(lr.departure_date)} →{" "}
                        {formatDateOnly(lr.expected_return_date)}
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
                            ? `Until ${formatDateOnly(r.end_date)}`
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
                      ? formatDateOnly(resident.date_of_birth)
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
                      ? formatDateOnly(resident.move_out_date)
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
                          {formatDateOnly(ba.start_date)}
                          {ba.end_date
                            ? ` — ${formatDateOnly(ba.end_date)}`
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
