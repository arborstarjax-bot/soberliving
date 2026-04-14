import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDaysSober } from "@/lib/milestones";
import { Users } from "lucide-react";
import Link from "next/link";
import { CreateResidentDialog } from "./create-resident-dialog";

export default async function ResidentsPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let query = supabase
    .from("residents")
    .select(
      "id, full_name, status, move_in_date, sobriety_date, house_id, houses(name)"
    )
    .order("full_name");

  if (houseFilter) {
    query = query.in("house_id", houseFilter);
  }

  const { data: residents } = await query;

  // Get houses for the create dialog
  let housesQuery = supabase
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) {
    housesQuery = housesQuery.in("id", houseFilter);
  }
  const { data: houses } = await housesQuery;

  const activeResidents = (residents ?? []).filter(
    (r) => r.status === "active"
  );
  const otherResidents = (residents ?? []).filter(
    (r) => r.status !== "active"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Residents</h1>
          <p className="text-muted-foreground">
            {activeResidents.length} active residents
          </p>
        </div>
        {(user.role === "admin" || user.role === "manager") && (
          <CreateResidentDialog houses={houses ?? []} />
        )}
      </div>

      {activeResidents.length === 0 && otherResidents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              No residents yet. Add your first resident to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeResidents.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Active</h2>
              {activeResidents.map((r) => (
                <Link key={r.id} href={`/residents/${r.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors">
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{r.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(r.houses as unknown as { name: string } | null)?.name} · Moved in{" "}
                          {new Date(r.move_in_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.sobriety_date && (
                          <span className="text-xs text-muted-foreground">
                            {getDaysSober(r.sobriety_date)} days sober
                          </span>
                        )}
                        <Badge variant="outline" className="capitalize">
                          {r.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {otherResidents.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-muted-foreground">
                Discharged / On Leave
              </h2>
              {otherResidents.map((r) => (
                <Link key={r.id} href={`/residents/${r.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors opacity-60">
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{r.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(r.houses as unknown as { name: string } | null)?.name}
                        </p>
                      </div>
                      <Badge
                        variant={
                          r.status === "discharged"
                            ? "secondary"
                            : "outline"
                        }
                        className="capitalize"
                      >
                        {r.status.replace("_", " ")}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
