import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { CreateDemeritDialog } from "./create-demerit-dialog";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Discipline</h1>
          <p className="text-muted-foreground">
            Demerits and disciplinary records
          </p>
        </div>
        {isStaff && (
          <CreateDemeritDialog houses={houses ?? []} residents={residents ?? []} />
        )}
      </div>

      {(demerits ?? []).length > 0 ? (
        <div className="space-y-3">
          {(demerits ?? []).map((d) => {
            const residentName = (d.resident as unknown as { full_name: string } | null)?.full_name ?? "Unknown";
            const houseName = (d.house as unknown as { name: string } | null)?.name ?? "";

            return (
              <Card key={d.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{residentName}</span>
                        {houseName && (
                          <Badge variant="outline" className="text-xs">{houseName}</Badge>
                        )}
                        <Badge variant="secondary">{d.points} pt{d.points !== 1 ? "s" : ""}</Badge>
                        {d.category && (
                          <Badge variant="outline" className="text-xs">{d.category}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{d.reason}</p>
                      {d.notes && (
                        <p className="text-sm text-muted-foreground italic">Note: {d.notes}</p>
                      )}
                      {d.photo_url && (
                        <a
                          href={d.photo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          View photo
                        </a>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(d.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              No demerits recorded yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
