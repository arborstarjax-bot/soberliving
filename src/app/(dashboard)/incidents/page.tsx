import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { CreateIncidentDialog } from "./create-incident-dialog";
import { Pagination } from "@/components/pagination";
import { getPageParams, buildPaginationMeta } from "@/lib/pagination";
import { formatDateOnly } from "@/lib/timezone";

interface IncidentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function IncidentsPage({ searchParams }: IncidentsPageProps) {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  const params = await searchParams;
  const { page, offset, pageSize } = getPageParams(params);

  // Trimmed select list — was `*`, but the row only reads severity,
  // description, category, and occurred_at plus the joined names.
  let query = supabase
    .from("incidents")
    .select(
      "id, severity, description, category, occurred_at, resident:residents(full_name), house:houses(name), reporter:users!reported_by(full_name)",
      { count: "exact" }
    )
    .order("occurred_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (houseFilter) {
    query = query.in("house_id", houseFilter);
  }

  const { data: incidents, count } = await query;
  const meta = buildPaginationMeta(count ?? 0, page, pageSize);

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
        <>
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
                      {(inc.resident as unknown as { full_name: string } | null)?.full_name}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateOnly(inc.occurred_at)}
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
        <Pagination
          meta={meta}
          basePath="/incidents"
          searchParams={params}
          itemLabel="incidents"
        />
        </>
      )}
    </div>
  );
}
