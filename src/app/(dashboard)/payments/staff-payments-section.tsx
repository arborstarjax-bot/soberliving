import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { APP_TIMEZONE } from "@/lib/timezone";
import type { SessionUser } from "@/lib/types";
import { PaymentsByResident } from "./payments-by-resident";
import { RentStructureCard } from "./rent-structure-card";
import { RentFlowKpis } from "./rent-flow-kpis";
import { OutstandingByResident } from "./outstanding-by-resident";
import { PaidLedger } from "./paid-ledger";

function computeDateBounds(): {
  todayIso: string;
  monthStartIso: string;
  monthEndIso: string;
  weekAheadIso: string;
} {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const todayIso = `${String(y).padStart(4, "0")}-${String(m).padStart(
    2,
    "0"
  )}-${String(d).padStart(2, "0")}`;
  const monthStartIso = `${String(y).padStart(4, "0")}-${String(m).padStart(
    2,
    "0"
  )}-01`;
  const lastDayUtc = new Date(Date.UTC(y, m, 0));
  const monthEndIso = `${lastDayUtc.getUTCFullYear()}-${String(
    lastDayUtc.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(lastDayUtc.getUTCDate()).padStart(2, "0")}`;
  const weekAheadUtc = new Date(Date.UTC(y, m - 1, d));
  weekAheadUtc.setUTCDate(weekAheadUtc.getUTCDate() + 7);
  const weekAheadIso = `${weekAheadUtc.getUTCFullYear()}-${String(
    weekAheadUtc.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(weekAheadUtc.getUTCDate()).padStart(2, "0")}`;
  return { todayIso, monthStartIso, monthEndIso, weekAheadIso };
}

/**
 * Staff payments body — Rent Structure + Rent Flow KPIs + 3 tabs
 * (By Resident / Outstanding / Paid). Lives behind a `<Suspense>`
 * boundary on `page.tsx` so the header + Record Payment button
 * paint immediately.
 */
export async function StaffPaymentsSection({ user }: { user: SessionUser }) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const { todayIso, monthStartIso, monthEndIso, weekAheadIso } =
    computeDateBounds();

  let paymentsQuery = supabase
    .from("payments")
    .select(
      "*, resident:residents(full_name), house:houses(name), recorder:users!recorded_by(full_name)"
    )
    .order("paid_at", { ascending: false })
    .limit(500);
  if (houseFilter) paymentsQuery = paymentsQuery.in("house_id", houseFilter);

  let openChargesQuery = supabase
    .from("payment_charges")
    .select(
      "id, resident_id, house_id, charge_type, amount, paid_amount, due_date, period_start, period_end, status, resident:residents(full_name), house:houses(name)"
    )
    .in("status", ["open", "partial"])
    .order("due_date", { ascending: true });
  if (houseFilter) openChargesQuery = openChargesQuery.in("house_id", houseFilter);

  let monthChargesQuery = supabase
    .from("payment_charges")
    .select("id, amount, paid_amount, due_date, status, charge_type")
    .gte("due_date", monthStartIso)
    .lte("due_date", monthEndIso);
  if (houseFilter) monthChargesQuery = monthChargesQuery.in("house_id", houseFilter);

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

  let commitmentsQuery = supabase
    .from("house_commitments")
    .select("payment_frequency, rent_amount, admin_fee, house_id")
    .eq("status", "active");
  if (houseFilter) commitmentsQuery = commitmentsQuery.in("house_id", houseFilter);

  let rentConfigsQuery = supabase
    .from("rent_configs")
    .select("house_id, monthly_amount, due_day_of_month")
    .eq("is_active", true);
  if (houseFilter) rentConfigsQuery = rentConfigsQuery.in("house_id", houseFilter);

  const [
    { data: payments },
    { data: openCharges },
    { data: monthCharges },
    { data: housesData },
    { data: residentsData },
    { data: commitmentsData },
    { data: rentConfigsData },
  ] = await Promise.all([
    paymentsQuery,
    openChargesQuery,
    monthChargesQuery,
    housesQuery,
    residentsQuery,
    commitmentsQuery,
    rentConfigsQuery,
  ]);

  const houses = (housesData ?? []) as { id: string; name: string }[];
  const residents = (residentsData ?? []) as {
    id: string;
    full_name: string;
    house_id: string;
  }[];
  const commitments = (commitmentsData ?? []) as {
    payment_frequency: string | null;
    rent_amount: number;
    admin_fee: number | null;
    house_id: string;
  }[];
  const rentConfigs = (rentConfigsData ?? []) as {
    house_id: string;
    monthly_amount: number;
    due_day_of_month: number;
  }[];
  const openChargeRows = openCharges ?? [];
  const monthChargeRows = (monthCharges ?? []) as {
    id: string;
    amount: number;
    paid_amount: number;
    due_date: string;
    status: string;
    charge_type: string;
  }[];

  const configMap: Record<
    string,
    { house_id: string; monthly_amount: number; due_day_of_month: number }
  > = {};
  for (const rc of rentConfigs) configMap[rc.house_id] = rc;

  const dueChargeRows = openChargeRows.filter(
    (c) => (c.due_date as string) <= todayIso
  );
  const pastDueCount = dueChargeRows.filter(
    (c) => (c.due_date as string) < todayIso
  ).length;

  return (
    <>
      <RentStructureCard
        commitments={commitments}
        houses={houses}
        existingConfigs={configMap}
      />

      <RentFlowKpis
        monthCharges={monthChargeRows}
        openCharges={openChargeRows.map((c) => ({
          amount: Number(c.amount),
          paid_amount: Number(c.paid_amount),
          due_date: c.due_date as string,
          status: c.status as string,
          charge_type: c.charge_type as string,
        }))}
        payments={(payments ?? []).map((p) => ({
          amount: Number(p.amount),
          paid_at: p.paid_at as string,
          status: p.status as string,
        }))}
        todayIso={todayIso}
        monthStartIso={monthStartIso}
        monthEndIso={monthEndIso}
        weekAheadIso={weekAheadIso}
      />

      <Tabs defaultValue="by-resident">
        <TabsList>
          <TabsTrigger value="by-resident">By Resident</TabsTrigger>
          <TabsTrigger value="outstanding">
            Outstanding
            {dueChargeRows.length > 0 && (
              <Badge
                variant={pastDueCount > 0 ? "destructive" : "secondary"}
                className="ml-1.5 h-5 px-1.5 text-xs"
              >
                {dueChargeRows.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
        </TabsList>

        <TabsContent value="by-resident" className="mt-4">
          <PaymentsByResident
            residents={residents.map((r) => ({
              id: r.id,
              full_name: r.full_name ?? "",
              house_id: r.house_id ?? "",
              house_name:
                houses.find((h) => h.id === r.house_id)?.name ?? "",
            }))}
            openCharges={openChargeRows.map((c) => ({
              id: c.id as string,
              resident_id: c.resident_id as string,
              house_id: c.house_id as string,
              charge_type: c.charge_type as string,
              amount: Number(c.amount),
              paid_amount: Number(c.paid_amount),
              due_date: c.due_date as string,
              period_start: (c.period_start as string | null) ?? null,
              period_end: (c.period_end as string | null) ?? null,
            }))}
            recentPayments={(payments ?? []).map((p) => ({
              id: p.id as string,
              resident_id: p.resident_id as string,
              amount: Number(p.amount),
              paid_at: p.paid_at as string,
              status: p.status as string,
              receipt_number: (p.receipt_number as string | null) ?? null,
              receipt_storage_path:
                (p.receipt_storage_path as string | null) ?? null,
            }))}
            isAdmin={user.role === "admin"}
          />
        </TabsContent>

        <TabsContent value="outstanding" className="mt-4">
          <OutstandingByResident
            charges={dueChargeRows.map((c) => ({
              id: c.id as string,
              resident_id: c.resident_id as string,
              resident_name:
                (c.resident as unknown as { full_name: string } | null)
                  ?.full_name ?? "Unknown",
              house_id: c.house_id as string,
              house_name:
                (c.house as unknown as { name: string } | null)?.name ?? "",
              charge_type: c.charge_type as string,
              amount: Number(c.amount),
              paid_amount: Number(c.paid_amount),
              due_date: c.due_date as string,
              period_start: (c.period_start as string | null) ?? null,
              period_end: (c.period_end as string | null) ?? null,
            }))}
            todayIso={todayIso}
          />
        </TabsContent>

        <TabsContent value="paid" className="mt-4">
          <PaidLedger
            payments={(payments ?? []).map((p) => ({
              id: p.id as string,
              amount: Number(p.amount),
              payment_type: (p.payment_type as string | null) ?? null,
              payment_method: (p.payment_method as string | null) ?? null,
              paid_at: p.paid_at as string,
              status: p.status as string,
              note: (p.note as string | null) ?? null,
              receipt_number: (p.receipt_number as string | null) ?? null,
              receipt_storage_path:
                (p.receipt_storage_path as string | null) ?? null,
              resident_name:
                (p.resident as unknown as { full_name: string } | null)
                  ?.full_name ?? "Unknown",
              house_name:
                (p.house as unknown as { name: string } | null)?.name ?? "",
              recorder_name:
                (p.recorder as unknown as { full_name: string } | null)
                  ?.full_name ?? "",
            }))}
            userRole={user.role}
            todayIso={todayIso}
            monthStartIso={monthStartIso}
            monthEndIso={monthEndIso}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
