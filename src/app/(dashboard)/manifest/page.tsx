import { requireAuth } from "@/lib/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ManifestView } from "./manifest-view";

export const dynamic = "force-dynamic";

export default async function ManifestPage() {
  const user = await requireAuth();
  if (user.role === "resident") redirect("/dashboard");

  const houseFilter = getAccessibleHouseFilter(user);
  const admin = createAdminClient();

  let housesQ = admin
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) housesQ = housesQ.in("id", houseFilter);
  const { data: houses } = await housesQ;
  const houseIds = (houses ?? []).map((h) => h.id as string);
  if (houseIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">House Manifest</h1>
        <EmptyState title="No houses" description="Add a house to see its manifest." />
      </div>
    );
  }

  const { data: rooms } = await admin
    .from("rooms")
    .select("id, name, house_id")
    .in("house_id", houseIds)
    .eq("is_active", true);
  const roomIds = (rooms ?? []).map((r) => r.id as string);

  const { data: beds } = roomIds.length
    ? await admin
        .from("beds")
        .select(
          "id, label, room_id, bed_assignments(end_date, resident:residents(full_name, status))"
        )
        .in("room_id", roomIds)
        .eq("is_active", true)
        .order("label")
    : { data: [] };

  const { data: residents } = await admin
    .from("residents")
    .select("id, full_name, status, house_id, sobriety_date, created_at")
    .in("house_id", houseIds)
    .order("full_name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">House Manifest</h1>
        <p className="text-muted-foreground">
          Every house, room, and bed — and who&apos;s in it.
        </p>
      </div>
      <ManifestView
        houses={houses ?? []}
        rooms={rooms ?? []}
        beds={
          (beds ?? []).map((b) => ({
            ...b,
            bed_assignments: (b.bed_assignments ?? []).map((ba) => ({
              ...ba,
              resident: Array.isArray(ba.resident)
                ? ba.resident[0] ?? null
                : ba.resident,
            })),
          })) as never
        }
        residents={residents ?? []}
      />
    </div>
  );
}
