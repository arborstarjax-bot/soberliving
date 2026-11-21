import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

/**
 * Tiny Suspense island for the "X/Y beds occupied" header badge.
 * Uses a lightweight join of `beds + bed_assignments` rather than
 * the full rooms+beds+bed_assignments+residents join the Occupancy
 * tab needs — so the header paints as soon as counts arrive,
 * without waiting for resident joins.
 *
 * Counts "Not Available" / "Empty" beds as occupied (same policy
 * as the Houses list — they're held off the available pool).
 */
export async function BedCountBadge({ houseId }: { houseId: string }) {
  const supabase = await createClient();

  const { data: beds } = await supabase
    .from("beds")
    .select("label, bed_assignments(end_date), rooms!inner(house_id, is_active)")
    .eq("is_active", true)
    .eq("rooms.house_id", houseId)
    .eq("rooms.is_active", true);

  let totalBeds = 0;
  let occupiedBeds = 0;
  for (const b of (beds ?? []) as Array<{
    label: string;
    bed_assignments: Array<{ end_date: string | null }> | null;
  }>) {
    totalBeds++;
    const hasActive = (b.bed_assignments ?? []).some((ba) => !ba.end_date);
    const isUnavailable =
      b.label.endsWith(" [Not Available]") || b.label.endsWith(" [Empty]");
    if (hasActive || isUnavailable) occupiedBeds++;
  }

  return (
    <Badge variant="outline" className="text-base">
      {occupiedBeds}/{totalBeds} beds occupied
    </Badge>
  );
}
