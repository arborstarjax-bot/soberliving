import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { CreateRestrictionDialog } from "./create-restriction-dialog";
import { DemeritMatrix } from "./demerit-matrix";
import { DisciplineTabs } from "./discipline-tabs";

export default async function DisciplinePage() {
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

  // Get residents
  let residentsQuery = supabase
    .from("residents")
    .select("id, full_name, house_id")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);
  const { data: residents } = await residentsQuery;

  // Get demerits (select only needed columns to avoid body size limit)
  let demeritsQuery = supabase
    .from("demerits")
    .select("id, resident_id, house_id, reason, notes, category, status, auto_generated, created_at, resolved_at, resolution_note, photo_url")
    .order("created_at", { ascending: false })
    .limit(200);
  if (houseFilter) demeritsQuery = demeritsQuery.in("house_id", houseFilter);
  const { data: demerits } = await demeritsQuery;

  // Auto-expire restrictions past their end date (staff only, house-scoped)
  const today = new Date().toISOString().split("T")[0];
  if (isStaff) {
    let expireQuery = supabase
      .from("restrictions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("is_active", true)
      .lte("end_date", today)
      .not("end_date", "is", null);
    if (houseFilter) expireQuery = expireQuery.in("house_id", houseFilter);
    await expireQuery;
  }

  // Get active restrictions
  let restrictionsQuery = supabase
    .from("restrictions")
    .select("*, resident:residents(full_name), house:houses(name)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (houseFilter) restrictionsQuery = restrictionsQuery.in("house_id", houseFilter);
  const { data: activeRestrictions } = await restrictionsQuery;

  // Get recently lifted/expired restrictions
  let pastRestrictionsQuery = supabase
    .from("restrictions")
    .select("*, resident:residents(full_name), house:houses(name)")
    .eq("is_active", false)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (houseFilter) pastRestrictionsQuery = pastRestrictionsQuery.in("house_id", houseFilter);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Discipline</h1>
        <p className="text-muted-foreground">
          Demerits, restrictions, and disciplinary records
        </p>
      </div>

      {/* Tabbed content */}
      <DisciplineTabs
        isStaff={isStaff}
        activeRestrictions={normalizedActiveRestrictions}
        pastRestrictions={normalizedPastRestrictions}
        addRestrictionButton={addRestrictionButton}
        demeritMatrixContent={demeritMatrixContent}
      />
    </div>
  );
}
