import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { CreateIncidentDialog } from "./create-incident-dialog";

export default async function IncidentsPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let query = supabase
    .from("incidents")
    .select("*, resident:residents(full_name), house:houses(name), reporter:users!reported_by(full_name)")
    .order("occurred_at", { ascending: false });

  if (houseFilter) {
    query = query.in("house_id", houseFilter);
  }

  const { data: incidents } = await query;

  // Get houses and residents for the create dialog
  let housesQuery = supabase.from("houses").select("id, name").eq("is_active", true).order("name");
  if (houseFilter) housesQuery = housesQuery.in("id", houseFilter);
  const { data: houses } = await housesQuery;

  let residentsQuery = supabase.from("residents").select("id, full_name, house_id").eq("status", "active").order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);
  const { data: residents } = await residentsQuery;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Incidents</h1>
          <p className="text-muted-foreground">
            Track incidents and demerits
          </p>
        </div>
        <CreateIncidentDialog
          houses={houses ?? []}
          residents={residents ?? []}
        />
      </div>

      {(incidents ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No incidents recorded</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(incidents ?? []).map((inc) => (
            <Card key={inc.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
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
                    <span className="font-medium text-sm">
                      {(inc.resident as { full_name: string })?.full_name}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(inc.occurred_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm mt-1">{inc.description}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  {inc.category && <span>Category: {inc.category}</span>}
                  <span>
                    · {(inc.house as unknown as { name: string } | null)?.name}
                  </span>
                  <span>
                    · Reported by {(inc.reporter as unknown as { full_name: string } | null)?.full_name}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
