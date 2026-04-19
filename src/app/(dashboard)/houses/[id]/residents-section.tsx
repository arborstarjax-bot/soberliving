import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getDaysSober } from "@/lib/milestones";
import { formatDateOnly } from "@/lib/timezone";

/**
 * Residents tab body — just the active residents in this house.
 * Only mounted when `tab=residents`.
 */
export async function ResidentsSection({ houseId }: { houseId: string }) {
  const supabase = await createClient();
  const { data: residents } = await supabase
    .from("residents")
    .select("id, full_name, status, move_in_date, sobriety_date")
    .eq("house_id", houseId)
    .eq("status", "active")
    .order("full_name");

  if (!residents || residents.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No active residents in this house
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {residents.map((r) => (
        <Link key={r.id as string} href={`/residents/${r.id}`}>
          <Card className="hover:bg-muted/50 transition-colors">
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{r.full_name as string}</p>
                <p className="text-xs text-muted-foreground">
                  Moved in: {formatDateOnly(r.move_in_date as string | null)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.sobriety_date && (
                  <span className="text-xs text-muted-foreground">
                    {getDaysSober(r.sobriety_date as string)} days sober
                  </span>
                )}
                <Badge variant="outline" className="capitalize">
                  {r.status as string}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
