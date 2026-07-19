import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import {
  SignOutHistoryFilterBar,
  type SignOutFilterBarResident,
} from "./filter-bar";

interface Row {
  id: string;
  full_name: string;
  house: { name: string } | { name: string }[] | null;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Loads the resident list scoped to houses this staff user can
 * see, then renders the filter bar client component. Wrapped in a
 * <Suspense> boundary on page.tsx so the page shell paints before
 * this query finishes.
 */
export async function SignOutHistoryFilterBarSection({
  user,
}: {
  user: SessionUser;
}) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let query = supabase
    .from("residents")
    .select("id, full_name, house:houses(name)")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (houseFilter) query = query.in("house_id", houseFilter);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const residents: SignOutFilterBarResident[] = rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    house_name: firstOrNull(r.house)?.name ?? null,
  }));

  return <SignOutHistoryFilterBar residents={residents} />;
}
