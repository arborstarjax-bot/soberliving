import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import { CreatePaymentDialog } from "./create-payment-dialog";

/**
 * Minimal data fetch just for the Record Payment dialog — the
 * houses / residents pickers and the open-charges selector. Runs
 * in its own `<Suspense>` island so the header paints immediately
 * and the button appears as soon as these small queries resolve,
 * independent of the heavier KPI + ledger fetch in the body.
 */
export async function CreatePaymentSection({ user }: { user: SessionUser }) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);

  let housesQuery = supabase
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (houseFilter) housesQuery = housesQuery.in("id", houseFilter);

  let residentsQuery = supabase
    .from("residents")
    .select("id, full_name, house_id")
    .eq("status", "active")
    .order("full_name");
  if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);

  let openChargesQuery = supabase
    .from("payment_charges")
    .select(
      "id, resident_id, amount, paid_amount, due_date, period_start, period_end, charge_type"
    )
    .in("status", ["open", "partial"])
    .order("due_date", { ascending: true });
  if (houseFilter) openChargesQuery = openChargesQuery.in("house_id", houseFilter);

  const [{ data: houses }, { data: residents }, { data: openCharges }] =
    await Promise.all([housesQuery, residentsQuery, openChargesQuery]);

  return (
    <CreatePaymentDialog
      houses={(houses ?? []) as { id: string; name: string }[]}
      residents={
        (residents ?? []) as {
          id: string;
          full_name: string;
          house_id: string;
        }[]
      }
      openCharges={(openCharges ?? []).map((c) => ({
        id: c.id as string,
        resident_id: c.resident_id as string,
        amount: Number(c.amount),
        paid_amount: Number(c.paid_amount),
        due_date: c.due_date as string,
        period_start: (c.period_start as string | null) ?? null,
        period_end: (c.period_end as string | null) ?? null,
        charge_type: c.charge_type as string,
      }))}
    />
  );
}
