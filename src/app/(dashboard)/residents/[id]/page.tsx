import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { getWorkspaceSettings } from "@/lib/workspace";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  calculateMilestones,
  getDaysSober,
  isSobrietyDateFuture,
} from "@/lib/milestones";
import { milestoneBadgeClasses } from "@/components/sobriety-chip";
import { formatDateOnly, getHouseToday } from "@/lib/timezone";
import { ResidentTimeline } from "./timeline";
import { ResidentNotes } from "./notes";
import { ForcePhotoToggle } from "./force-photo-toggle";
import { EditResidentForm } from "./edit-resident-form";
import { DischargeDialog } from "./discharge-dialog";
import { ChangeBedDialog, type BedOption } from "./change-bed-dialog";
import { TransferHouseDialog } from "./transfer-house-dialog";
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
    .maybeSingle();

  if (!resident) redirect("/residents");

  if (
    user.role !== "admin" &&
    user.role !== "resident" &&
    !canAccessHouse(user, resident.house_id)
  ) {
    redirect("/dashboard");
  }

  const wsSettings = user.workspace_id
    ? await getWorkspaceSettings(user.workspace_id)
    : null;
  const paymentsEnabled = wsSettings?.enable_payments !== false;

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

  // Discipline data for this resident — shown in the Discipline tab.
  // Demerits are point-bearing incidents; warnings are point-free
  // records kept separately. Restrictions (below) round out the tab.
  const { data: demerits } = await supabase
    .from("demerits")
    .select(
      "id, reason, notes, category, status, auto_generated, created_at, resolved_at, resolution_note, photo_url"
    )
    .eq("resident_id", id)
    .order("created_at", { ascending: false });

  const { data: warnings } = await supabase
    .from("warnings")
    .select(
      "id, reason, notes, category, photo_url, signoff_id, created_at, issuer:users!issued_by(full_name)"
    )
    .eq("resident_id", id)
    .order("created_at", { ascending: false });

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
  //
  // We try `resident_id` first and fall back to `user_id` because
  // some historical commitment rows never got their `resident_id`
  // backfilled (the column was added mid-flight). Without the
  // fallback, those residents render with no Payment Terms card —
  // which in turn hides the Edit Commitment Agreement button and
  // the Upcoming Rent card, even though the commitment is clearly
  // active (charges are being opened against it).
  let { data: activeCommitment } = await supabase
    .from("house_commitments")
    .select(
      "id, rent_amount, admin_fee, payment_frequency, commitment_start_date, commitment_term, restrictions_notes, notes, status, pdf_storage_path"
    )
    .eq("resident_id", id)
    .eq("status", "active")
    .order("commitment_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!activeCommitment && resident.user_id) {
    const { data: byUser } = await supabase
      .from("house_commitments")
      .select(
        "id, rent_amount, admin_fee, payment_frequency, commitment_start_date, commitment_term, restrictions_notes, notes, status, pdf_storage_path"
      )
      .eq("user_id", resident.user_id)
      .eq("status", "active")
      .order("commitment_start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    activeCommitment = byUser ?? null;
  }
  // Final fallback: the resident has charges on the books but no
  // row flagged `status='active'`. Can happen when a commitment
  // was mistakenly left in a non-terminal status (e.g. never
  // flipped from 'pending_resident_signature' after the resident
  // signed on paper, or a migration left it as NULL). Grab the most
  // recent non-cancelled commitment by user_id so the Payment Terms
  // card and Edit button always surface — admins need a way to fix
  // the terms even if the status field drifted.
  if (!activeCommitment && resident.user_id) {
    // `.or("status.is.null,status.neq.cancelled")` — PostgREST's
    // `neq` translates to SQL `status <> 'cancelled'`, which
    // evaluates to NULL (not TRUE) for rows where status itself is
    // NULL, so those rows would silently slip out of the result
    // set. The `status.is.null` branch puts them back in. Matches
    // the scenario explicitly called out in the comment above —
    // an older migration left status NULL for some rows.
    const { data: latest } = await supabase
      .from("house_commitments")
      .select(
        "id, rent_amount, admin_fee, payment_frequency, commitment_start_date, commitment_term, restrictions_notes, notes, status, pdf_storage_path"
      )
      .eq("user_id", resident.user_id)
      .or("status.is.null,status.neq.cancelled")
      .order("commitment_start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    activeCommitment = latest ?? null;
  }
  // Last-resort fallback: resident has NO linked user account
  // (user_id on residents is NULL — staff-only-tracked resident, or
  // the auth link was never created). All three user_id fallbacks
  // above short-circuit in that case. We still want the Payment
  // Terms card to surface, so try the same non-cancelled (including
  // NULL) status filter keyed on resident_id directly.
  if (!activeCommitment) {
    const { data: latestByResident } = await supabase
      .from("house_commitments")
      .select(
        "id, rent_amount, admin_fee, payment_frequency, commitment_start_date, commitment_term, restrictions_notes, notes, status, pdf_storage_path"
      )
      .eq("resident_id", id)
      .or("status.is.null,status.neq.cancelled")
      .order("commitment_start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    activeCommitment = latestByResident ?? null;
  }

  // Pending payment-terms amendment awaiting resident signature. Shown
  // as a callout on the Payment Terms card so admins don't propose a
  // second amendment while one is in flight (the DB unique index
  // prevents it, but the callout gives them a clearer reason).
  const { data: pendingAmendment } = resident.user_id
    ? await supabase
        .from("house_commitments")
        .select(
          "id, rent_amount, admin_fee, effective_date, amendment_reason, created_at, parent_commitment_id, payment_frequency"
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

  // Pre-sign the active commitment's PDF storage URL so the View
  // Signed Commitment button on the Payments tab can render as a
  // real <a href> — iOS Safari silently drops `window.open` calls
  // that fire after an async server action resolves because the
  // user-gesture context is gone. Server-side signing keeps the
  // button working on every device.
  let activeCommitmentPdfSignedUrl: string | null = null;
  const activeCommitmentPdfPath =
    (activeCommitment?.pdf_storage_path as string | null) ?? null;
  if (activeCommitmentPdfPath) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.storage
        .from("documents")
        .createSignedUrl(activeCommitmentPdfPath, 3600);
      activeCommitmentPdfSignedUrl = data?.signedUrl ?? null;
    } catch (e) {
      console.error("Failed to sign commitment PDF URL", e);
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
    type HouseBedRow = {
      id: string;
      label: string;
      room: { name: string } | null;
      bed_assignments: { end_date: string | null }[];
    };
    bedOptions = ((houseBeds ?? []) as unknown as HouseBedRow[])
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
            {(resident.houses as { name: string } | null)?.name} ·{" "}
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
          {user.role === "admin" && resident.status === "active" && (
            <TransferHouseDialog
              residentId={id}
              currentHouseId={resident.house_id}
              residentName={resident.full_name}
              houses={(allHouses ?? []).map((h) => ({ id: h.id, name: h.name }))}
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
      {paymentsEnabled && resident.status === "active" && (
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
              {milestones.map((m) => {
                const tierClass = m.reached
                  ? milestoneBadgeClasses(m.days)
                  : null;
                return (
                  <Badge
                    key={m.label}
                    variant={m.reached ? "default" : "outline"}
                    className={
                      m.reached
                        ? tierClass ?? ""
                        : "opacity-40"
                    }
                  >
                    {m.label}
                    {m.reached && " ✓"}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="chores">
        <TabsList>
          <TabsTrigger value="chores">
            Chores ({choreAssignments?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="discipline">
            Discipline (
            {(demerits?.length ?? 0) + (warnings?.length ?? 0)})
          </TabsTrigger>
          <TabsTrigger value="leave">
            Leave ({leaveRequests?.length ?? 0})
          </TabsTrigger>
          {paymentsEnabled && (
            <TabsTrigger value="payments">
              Payments ({(residentOpenCharges ?? []).length})
            </TabsTrigger>
          )}
          {isStaff && (
            <TabsTrigger value="notes">
              Notes ({notes?.length ?? 0})
            </TabsTrigger>
          )}
          <TabsTrigger value="documents">
            Documents ({documents?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="chores" className="mt-4">
          {choreAssignments && choreAssignments.length > 0 ? (
            <div className="space-y-2">
              {choreAssignments.map((ca) => {
                const signoffs = (ca.chore_signoffs as Array<{ status: string }> | null) ?? [];
                const approved = signoffs.filter((s) => s.status === "approved").length;
                const total = signoffs.length;
                const rotation = ca.rotation as {
                  cycle_start_date: string;
                  cycle_end_date: string;
                  is_current: boolean;
                } | null;
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

        <TabsContent value="discipline" className="mt-4 space-y-6">
          {/* Active restrictions — surfaced first because they shape
              what the resident can / can't do today. */}
          {restrictions && restrictions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Active Restrictions ({restrictions.length})
              </h3>
              {restrictions.map((r) => (
                <Card key={r.id} className="border-red-200 bg-red-50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="destructive" className="capitalize">
                        {(r.restriction_type as string)?.replace(/_/g, " ") ??
                          "restriction"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateOnly(r.start_date as string)}
                        {r.end_date
                          ? ` → ${formatDateOnly(r.end_date as string)}`
                          : " → ongoing"}
                      </span>
                    </div>
                    {r.description && (
                      <p className="text-sm mt-1">{r.description as string}</p>
                    )}
                    {r.notes && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {r.notes as string}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Demerits — point-bearing disciplinary records. Status
              distinguishes active from worked-off. */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Demerits ({demerits?.length ?? 0})
            </h3>
            {demerits && demerits.length > 0 ? (
              demerits.map((d) => (
                <Card key={d.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            d.status === "active"
                              ? "destructive"
                              : "secondary"
                          }
                          className="capitalize"
                        >
                          {(d.status as string)?.replace(/_/g, " ")}
                        </Badge>
                        {d.auto_generated && (
                          <Badge variant="outline" className="text-xs">
                            Auto
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateOnly(d.created_at as string)}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{d.reason as string}</p>
                    {d.category && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Category: {d.category as string}
                      </p>
                    )}
                    {d.notes && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {d.notes as string}
                      </p>
                    )}
                    {d.resolution_note && d.status === "worked_off" && (
                      <p className="text-xs text-green-700 mt-1">
                        Worked off: {d.resolution_note as string}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-muted-foreground text-sm py-2">
                No demerits
              </p>
            )}
          </div>

          {/* Warnings — point-free disciplinary records. */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Warnings ({warnings?.length ?? 0})
            </h3>
            {warnings && warnings.length > 0 ? (
              warnings.map((w) => {
                const issuer = Array.isArray(w.issuer)
                  ? w.issuer[0]
                  : w.issuer;
                const issuerName =
                  (issuer as { full_name?: string } | null)?.full_name ?? null;
                return (
                  <Card key={w.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="capitalize">
                          Warning
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateOnly(w.created_at as string)}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{w.reason as string}</p>
                      {w.category && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Category: {w.category as string}
                        </p>
                      )}
                      {w.notes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {w.notes as string}
                        </p>
                      )}
                      {issuerName && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Issued by {issuerName}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <p className="text-muted-foreground text-sm py-2">
                No warnings
              </p>
            )}
          </div>
        </TabsContent>

        {paymentsEnabled && <TabsContent value="payments" className="mt-4">
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
                    payment_frequency:
                      ((activeCommitment.payment_frequency as
                        | "weekly"
                        | "monthly"
                        | null) ?? "monthly"),
                    commitment_start_date:
                      activeCommitment.commitment_start_date as string,
                    pdf_storage_path:
                      (activeCommitment.pdf_storage_path as string | null) ??
                      null,
                    pdf_signed_url: activeCommitmentPdfSignedUrl,
                    commitment_term:
                      (activeCommitment.commitment_term as string | null) ??
                      null,
                    restrictions_notes:
                      (activeCommitment.restrictions_notes as
                        | string
                        | null) ?? null,
                    notes:
                      (activeCommitment.notes as string | null) ?? null,
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
                    payment_frequency:
                      (pendingAmendment.payment_frequency as
                        | "weekly"
                        | "monthly"
                        | null) ?? null,
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
        </TabsContent>}

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
          <DocumentsList
            documents={documents ?? []}
            canDelete={user.role === "admin"}
          />
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

        <TabsContent value="activity" className="mt-4">
          <ResidentTimeline activity={activity ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
