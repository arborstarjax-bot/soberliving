import { createClient } from "@/lib/supabase/server";
import { SupplyList, type SupplyItem } from "./supply-list";

/**
 * Supplies tab body — supply_items for this house. Only mounted
 * when `tab=supplies`.
 */
export async function SuppliesSection({
  houseId,
  canManage,
}: {
  houseId: string;
  canManage: boolean;
}) {
  const supabase = await createClient();
  const { data: supplies } = await supabase
    .from("supply_items")
    .select("id, name, is_in_stock, updated_at")
    .eq("house_id", houseId)
    .order("name");

  const items: SupplyItem[] = ((supplies ?? []) as Array<{
    id: string;
    name: string;
    is_in_stock: boolean;
    updated_at: string;
  }>).map((s) => ({
    id: s.id,
    name: s.name,
    is_in_stock: s.is_in_stock,
    updated_at: s.updated_at,
  }));

  return <SupplyList houseId={houseId} items={items} canManage={canManage} />;
}
