import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { CreateDemeritDialog } from "./create-demerit-dialog";
import { CreateRestrictionDialog } from "./create-restriction-dialog";
import { LiftRestrictionButton } from "./lift-restriction-button";
import { DemeritManager } from "./demerit-manager";

const RESTRICTION_TYPE_LABELS: Record<string, string> = {
  no_leave: "No Leave",
  weekend_restriction: "Weekend",
  house_commitment: "House Commitment",
  curfew: "Curfew",
  custom: "Custom",
};

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

  // Get demerits
  let demeritsQuery = supabase
    .from("demerits")
    .select("*, resident:residents(full_name), house:houses(name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (houseFilter) demeritsQuery = demeritsQuery.in("house_id", houseFilter);
  const { data: demerits } = await demeritsQuery;

  // Auto-expire restrictions past their end date
  const today = new Date().toISOString().split("T")[0];
  await supabase
    .from("restrictions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("is_active", true)
    .lte("end_date", today)
    .not("end_date", "is", null);

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Discipline</h1>
          <p className="text-muted-foreground">
            Demerits, restrictions, and disciplinary records
          </p>
        </div>
        {isStaff && (
          <div className="flex items-center gap-2">
            <CreateRestrictionDialog houses={houses ?? []} residents={residents ?? []} />
            <CreateDemeritDialog houses={houses ?? []} residents={residents ?? []} />
          </div>
        )}
      </div>

      {/* Active Restrictions */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Active Restrictions
          {(activeRestrictions ?? []).length > 0 && (
            <Badge variant="destructive">{(activeRestrictions ?? []).length}</Badge>
          )}
        </h2>
        {(activeRestrictions ?? []).length > 0 ? (
          <div className="space-y-3">
            {(activeRestrictions ?? []).map((r) => {
              const residentName = (r.resident as unknown as { full_name: string } | null)?.full_name ?? "Unknown";
              const houseName = (r.house as unknown as { name: string } | null)?.name ?? "";
              const typeLabel = RESTRICTION_TYPE_LABELS[r.restriction_type] ?? r.restriction_type;

              return (
                <Card key={r.id} className="border-red-200">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{residentName}</span>
                          {houseName && (
                            <Badge variant="outline" className="text-xs">{houseName}</Badge>
                          )}
                          <Badge variant="destructive" className="text-xs">{typeLabel}</Badge>
                          {r.is_house_commitment && (
                            <Badge variant="secondary" className="text-xs">New Intake</Badge>
                          )}
                        </div>
                        <p className="text-sm">{r.description}</p>
                        {r.notes && (
                          <p className="text-sm text-muted-foreground italic">Note: {r.notes}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>From: {new Date(r.start_date).toLocaleDateString()}</span>
                          {r.end_date ? (
                            <span>Until: {new Date(r.end_date).toLocaleDateString()}</span>
                          ) : (
                            <span>Indefinite</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isStaff && <LiftRestrictionButton restrictionId={r.id} />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">No active restrictions.</p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Demerits — grouped by house with edit/delete/mark-worked-off */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Demerits
        </h2>
        {(houses ?? []).map((house) => {
          const houseDemerits = (demerits ?? []).filter((d) => d.house_id === house.id).map((d) => ({
            id: d.id,
            resident_id: d.resident_id,
            reason: d.reason,
            notes: d.notes ?? null,
            status: d.status ?? "active",
            auto_generated: d.auto_generated ?? false,
            created_at: d.created_at,
            worked_off_at: d.resolved_at ?? null,
            worked_off_note: d.resolution_note ?? null,
          }));
          const houseResidents = (residents ?? []).filter((r) => r.house_id === house.id).map((r) => ({
            id: r.id,
            full_name: r.full_name,
          }));
          if (houseDemerits.length === 0 && houseResidents.length === 0) return null;
          return (
            <DemeritManager
              key={house.id}
              houseId={house.id}
              houseName={house.name}
              residents={houseResidents}
              demerits={houseDemerits}
              userRole={user.role}
            />
          );
        })}
        {(demerits ?? []).length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">No demerits recorded yet.</p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Past Restrictions */}
      {(pastRestrictions ?? []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-muted-foreground">
            Past Restrictions
          </h2>
          <div className="space-y-2">
            {(pastRestrictions ?? []).map((r) => {
              const residentName = (r.resident as unknown as { full_name: string } | null)?.full_name ?? "Unknown";
              const typeLabel = RESTRICTION_TYPE_LABELS[r.restriction_type] ?? r.restriction_type;

              return (
                <Card key={r.id} className="opacity-60">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{residentName}</span>
                        <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
                        <span className="text-xs text-muted-foreground">{r.description}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {r.end_date
                          ? `Expired ${new Date(r.end_date).toLocaleDateString()}`
                          : `Lifted ${new Date(r.updated_at).toLocaleDateString()}`}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
