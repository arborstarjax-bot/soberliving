import { requireAuth } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { CreateRestrictionDialog } from "./create-restriction-dialog";
import { DemeritMatrix } from "./demerit-matrix";
import { DisciplineTabs } from "./discipline-tabs";
import { CreateIncidentDialog } from "../incidents/create-incident-dialog";

export default async function DisciplinePage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const adminClient = createAdminClient();
  const houseFilter = getAccessibleHouseFilter(user);

  const isStaff = user.role === "admin" || user.role === "manager";

  // For residents, find their resident record to scope queries to their own data
  let residentRecordId: string | null = null;
  let residentHouseId: string | null = null;
  if (user.role === "resident") {
    const { data: myResident } = await supabase
      .from("residents")
      .select("id, house_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    residentRecordId = myResident?.id ?? null;
    residentHouseId = myResident?.house_id ?? null;

    // Guard: if resident has no active record, show empty discipline page
    if (!residentRecordId) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Discipline</h1>
            <p className="text-muted-foreground">
              No active resident record found. Contact your house manager for assistance.
            </p>
          </div>
        </div>
      );
    }
  }

  // Get houses
  let housesQuery = adminClient
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (houseFilter && houseFilter.length > 0) housesQuery = housesQuery.in("id", houseFilter);
  if (residentHouseId) housesQuery = housesQuery.eq("id", residentHouseId);
  const { data: houses } = await housesQuery;

  // Get residents — for residents, only show themselves
  let residentsQuery = adminClient
    .from("residents")
    .select("id, full_name, house_id")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter && houseFilter.length > 0) residentsQuery = residentsQuery.in("house_id", houseFilter);
  if (residentRecordId) residentsQuery = residentsQuery.eq("id", residentRecordId);
  const { data: residents } = await residentsQuery;

  // Get demerits (select only needed columns to avoid body size limit)
  let demeritsQuery = adminClient
    .from("demerits")
    .select("id, resident_id, house_id, reason, notes, category, status, auto_generated, created_at, resolved_at, resolution_note, photo_url")
    .order("created_at", { ascending: false })
    .limit(200);
  if (houseFilter && houseFilter.length > 0) demeritsQuery = demeritsQuery.in("house_id", houseFilter);
  if (residentRecordId) demeritsQuery = demeritsQuery.eq("resident_id", residentRecordId);
  const { data: demerits } = await demeritsQuery;

  // Auto-expire restrictions past their end date (runs for all users)
  const today = new Date().toISOString().split("T")[0];
  {
    let expireQuery = adminClient
      .from("restrictions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("is_active", true)
      .lte("end_date", today)
      .not("end_date", "is", null);
    if (houseFilter && houseFilter.length > 0) expireQuery = expireQuery.in("house_id", houseFilter);
    if (residentRecordId) expireQuery = expireQuery.eq("resident_id", residentRecordId);
    await expireQuery;
  }

  // Get active restrictions
  let restrictionsQuery = adminClient
    .from("restrictions")
    .select("*, resident:residents(full_name), house:houses(name)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (houseFilter && houseFilter.length > 0) restrictionsQuery = restrictionsQuery.in("house_id", houseFilter);
  if (residentRecordId) restrictionsQuery = restrictionsQuery.eq("resident_id", residentRecordId);
  const { data: activeRestrictions } = await restrictionsQuery;

  // Get recently lifted/expired restrictions
  let pastRestrictionsQuery = adminClient
    .from("restrictions")
    .select("*, resident:residents(full_name), house:houses(name)")
    .eq("is_active", false)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (houseFilter && houseFilter.length > 0) pastRestrictionsQuery = pastRestrictionsQuery.in("house_id", houseFilter);
  if (residentRecordId) pastRestrictionsQuery = pastRestrictionsQuery.eq("resident_id", residentRecordId);
  const { data: pastRestrictions } = await pastRestrictionsQuery;

  // Normalize restriction data for client component
  const normalizedActiveRestrictions = (activeRestrictions ?? []).map((r) => ({
    id: r.id as string,
    resident_id: r.resident_id as string,
    house_id: r.house_id as string,
    restriction_type: r.restriction_type as string,
    description: r.description as string,
    notes: (r.notes as string) ?? null,
    start_date: r.start_date as string,
    end_date: (r.end_date as string) ?? null,
    is_active: r.is_active as boolean,
    is_house_commitment: r.is_house_commitment as boolean,
    updated_at: r.updated_at as string,
    resident_name: (r.resident as unknown as { full_name: string } | null)?.full_name ?? "Unknown",
    house_name: (r.house as unknown as { name: string } | null)?.name ?? "",
  }));

  const normalizedPastRestrictions = (pastRestrictions ?? []).map((r) => ({
    id: r.id as string,
    restriction_type: r.restriction_type as string,
    description: r.description as string,
    end_date: (r.end_date as string) ?? null,
    updated_at: r.updated_at as string,
    resident_name: (r.resident as unknown as { full_name: string } | null)?.full_name ?? "Unknown",
  }));

  const demeritMatrixContent = (
    <DemeritMatrix
      houses={houses ?? []}
      residents={residents ?? []}
      demerits={(demerits ?? []).map((d) => ({
        id: d.id,
        resident_id: d.resident_id,
        house_id: d.house_id,
        reason: d.reason,
        notes: d.notes ?? null,
        category: d.category ?? null,
        status: d.status ?? "active",
        auto_generated: d.auto_generated ?? false,
        created_at: d.created_at,
        resolved_at: d.resolved_at ?? null,
        resolution_note: d.resolution_note ?? null,
        photo_url: d.photo_url ?? null,
      }))}
      userRole={user.role}
    />
  );

  const addRestrictionButton = isStaff ? (
    <CreateRestrictionDialog houses={houses ?? []} residents={residents ?? []} />
  ) : null;

  // Fetch incidents for the Incidents tab (staff only)
  let incidents: Array<{
    id: string;
    severity: string;
    category: string | null;
    description: string;
    occurred_at: string;
    photo_url: string | null;
    resident_name: string;
    house_name: string;
    reporter_name: string;
  }> = [];

  if (isStaff) {
    let incidentsQuery = adminClient
      .from("incidents")
      .select("id, severity, category, description, occurred_at, photo_url, resident:residents(full_name), house:houses(name), reporter:users!reported_by(full_name)")
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (houseFilter && houseFilter.length > 0) incidentsQuery = incidentsQuery.in("house_id", houseFilter);
    const { data: rawIncidents } = await incidentsQuery;
    incidents = (rawIncidents ?? []).map((inc) => ({
      id: inc.id as string,
      severity: inc.severity as string,
      category: (inc.category as string) ?? null,
      description: inc.description as string,
      occurred_at: inc.occurred_at as string,
      photo_url: (inc.photo_url as string) ?? null,
      resident_name: (inc.resident as unknown as { full_name: string } | null)?.full_name ?? "Unknown",
      house_name: (inc.house as unknown as { name: string } | null)?.name ?? "",
      reporter_name: (inc.reporter as unknown as { full_name: string } | null)?.full_name ?? "Unknown",
    }));
  }

  const addIncidentButton = isStaff ? (
    <CreateIncidentDialog houses={houses ?? []} residents={residents ?? []} />
  ) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Discipline</h1>
        <p className="text-muted-foreground">
          Demerits, restrictions, incidents, and disciplinary records
        </p>
      </div>

      {/* Tabbed content */}
      <DisciplineTabs
        isStaff={isStaff}
        activeRestrictions={normalizedActiveRestrictions}
        pastRestrictions={normalizedPastRestrictions}
        addRestrictionButton={addRestrictionButton}
        demeritMatrixContent={demeritMatrixContent}
        incidents={incidents}
        addIncidentButton={addIncidentButton}
      />
    </div>
  );
}
