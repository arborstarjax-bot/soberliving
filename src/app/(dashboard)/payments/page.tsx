import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CreatePaymentDialog } from "./create-payment-dialog";
import {
  sweepOpenChargesForActiveCommitments,
  openAllChargesForCommitment,
} from "@/lib/payments/charges";
import { ResidentPaymentsView } from "./resident-view";
import { PaymentsByResident } from "./payments-by-resident";
import { RentStructureCard } from "./rent-structure-card";
import { RentFlowKpis } from "./rent-flow-kpis";
import { OutstandingByResident } from "./outstanding-by-resident";
import { PaidLedger } from "./paid-ledger";
import { APP_TIMEZONE } from "@/lib/timezone";

// Staff /payments hub. Organized around rent flow, not receipts:
//
//   1. Rent Structure card at the very top — what this facility
//      charges in plain numbers ($225 weekly / $800 monthly /
//      $200 admin). Derived from active commitments.
//   2. Rent-flow KPIs — Collected this month / Expected this month
//      / Past due / Due next 7 days. Replaces the old lifetime
//      Total Collected number which isn't actionable.
//   3. Tabs: By Resident / Outstanding / Paid.
//      • Outstanding groups every open/partial charge by resident
//        so staff see "who owes what" at a glance.
//      • Paid has a date-range filter (this month / last month /
//        90 days / all) + search.

interface PaymentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Compute the Eastern-local YYYY-MM-DD for today, first-of-month,
// last-of-month, and today+7. All downstream filtering is string
// compared, so we only need these six values.
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
  // Day 0 of next month = last day of this month.
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

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const isStaff = user.role === "admin" || user.role === "manager";

  // searchParams is reserved for future filters (e.g. ?house=xxx).
  await searchParams;

  // Lazy "cron": on every staff page load, backfill missing charges
  // up to today. Idempotent via the (resident, due_date, charge_type)
  // unique index.
  if (isStaff) {
    try {
      await sweepOpenChargesForActiveCommitments(houseFilter ?? null);
    } catch (e) {
      console.error("Charge sweep failed", e);
    }
  }

  const { todayIso, monthStartIso, monthEndIso, weekAheadIso } =
    computeDateBounds();

  // Resident lookup (no-op for staff). Residents need their active
  // commitment to populate the Payment Terms card, and the backfill
  // runs against it directly since they don't trigger the staff
  // sweep.
  let residentRecord: { id: string } | null = null;
  let residentTerms: {
    rent_amount: number;
    admin_fee: number | null;
    commitment_start_date: string;
    pdf_storage_path: string | null;
  } | null = null;
  if (user.role === "resident") {
    const { data } = await supabase
      .from("residents")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    residentRecord = data;
    if (residentRecord) {
      const { data: commitment } = await supabase
        .from("house_commitments")
        .select(
          "id, rent_amount, admin_fee, commitment_start_date, pdf_storage_path"
        )
        .eq("resident_id", residentRecord.id)
        .eq("status", "active")
        .order("commitment_start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (commitment?.id) {
        try {
          await openAllChargesForCommitment(commitment.id as string);
        } catch (e) {
          console.error("Resident charge backfill failed", e);
        }
        residentTerms = {
          rent_amount: Number(commitment.rent_amount ?? 0),
          admin_fee:
            commitment.admin_fee !== null && commitment.admin_fee !== undefined
              ? Number(commitment.admin_fee)
              : null,
          commitment_start_date:
            commitment.commitment_start_date as string,
          pdf_storage_path:
            (commitment.pdf_storage_path as string | null) ?? null,
        };
      }
    }
  }

  // Build queries up front so everything fans out in one Promise.all.
  // Residents only need their own rows; staff pull aggregate data for
  // the KPIs and the rent-structure card.

  // Payments ledger — for staff we fetch the last ~year's worth
  // (capped) so the Paid tab's date-range filter can cover This
  // month / Last month / Last 90 days without a follow-up query.
  // Residents see their own full history (also capped).
  let paymentsQuery = supabase
    .from("payments")
    .select(
      "*, resident:residents(full_name), house:houses(name), recorder:users!recorded_by(full_name)"
    )
    .order("paid_at", { ascending: false })
    .limit(500);
  if (user.role === "resident" && residentRecord) {
    paymentsQuery = paymentsQuery.eq("resident_id", residentRecord.id);
  } else if (houseFilter) {
    paymentsQuery = paymentsQuery.in("house_id", houseFilter);
  }

  // Open charges — drives Outstanding + the By Resident tab + the
  // Record Payment dialog's "Apply to Charge" selector.
  let openChargesQuery = supabase
    .from("payment_charges")
    .select(
      "id, resident_id, house_id, charge_type, amount, paid_amount, due_date, period_start, period_end, status, resident:residents(full_name), house:houses(name)"
    )
    .in("status", ["open", "partial"])
    .order("due_date", { ascending: true });
  if (user.role === "resident" && residentRecord) {
    openChargesQuery = openChargesQuery.eq("resident_id", residentRecord.id);
  } else if (houseFilter) {
    openChargesQuery = openChargesQuery.in("house_id", houseFilter);
  }

  // Charges in the current month — drives the "Expected this month"
  // KPI. Includes paid ones because expected = total billed, not
  // total outstanding.
  let monthChargesQuery = isStaff
    ? supabase
        .from("payment_charges")
        .select("id, amount, paid_amount, due_date, status, charge_type")
        .gte("due_date", monthStartIso)
        .lte("due_date", monthEndIso)
    : null;
  if (monthChargesQuery && houseFilter)
    monthChargesQuery = monthChargesQuery.in("house_id", houseFilter);

  let housesQuery = isStaff
    ? supabase
        .from("houses")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
    : null;
  if (housesQuery && houseFilter)
    housesQuery = housesQuery.in("id", houseFilter);

  let residentsQuery = isStaff
    ? supabase
        .from("residents")
        .select("id, full_name, house_id")
        .eq("status", "active")
        .order("full_name")
    : null;
  if (residentsQuery && houseFilter)
    residentsQuery = residentsQuery.in("house_id", houseFilter);

  // Active commitments → Rent Structure card. Every row has payment
  // frequency / rent amount / admin fee already, so the card can
  // derive the three numbers without a separate config table.
  let commitmentsQuery = isStaff
    ? supabase
        .from("house_commitments")
        .select("payment_frequency, rent_amount, admin_fee, house_id")
        .eq("status", "active")
    : null;
  if (commitmentsQuery && houseFilter)
    commitmentsQuery = commitmentsQuery.in("house_id", houseFilter);

  let rentConfigsQuery = isStaff
    ? supabase
        .from("rent_configs")
        .select("house_id, monthly_amount, due_day_of_month")
        .eq("is_active", true)
    : null;
  if (rentConfigsQuery && houseFilter)
    rentConfigsQuery = rentConfigsQuery.in("house_id", houseFilter);

  const nullRes = Promise.resolve({ data: null });

  const [
    { data: payments },
    { data: openCharges },
    monthChargesRes,
    housesRes,
    residentsRes,
    commitmentsRes,
    rentConfigsRes,
  ] = await Promise.all([
    paymentsQuery,
    openChargesQuery,
    monthChargesQuery ?? nullRes,
    housesQuery ?? nullRes,
    residentsQuery ?? nullRes,
    commitmentsQuery ?? nullRes,
    rentConfigsQuery ?? nullRes,
  ]);

  const houses = (housesRes.data ?? []) as { id: string; name: string }[];
  const residents = (residentsRes.data ?? []) as {
    id: string;
    full_name: string;
    house_id: string;
  }[];
  const commitments = (commitmentsRes.data ?? []) as {
    payment_frequency: string | null;
    rent_amount: number;
    admin_fee: number | null;
    house_id: string;
  }[];
  const rentConfigs = (rentConfigsRes.data ?? []) as {
    house_id: string;
    monthly_amount: number;
    due_day_of_month: number;
  }[];
  const openChargeRows = openCharges ?? [];
  const monthCharges = (monthChargesRes.data ?? []) as {
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
  for (const rc of rentConfigs) {
    configMap[rc.house_id] = rc;
  }

  const dueChargeRows = openChargeRows.filter(
    (c) => (c.due_date as string) <= todayIso
  );
  const pastDueCount = dueChargeRows.filter(
    (c) => (c.due_date as string) < todayIso
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-muted-foreground">
            Track rent flow, open balances, and receipts
          </p>
        </div>
        {isStaff && (
          <CreatePaymentDialog
            houses={houses}
            residents={residents}
            openCharges={openChargeRows.map((c) => ({
              id: c.id,
              resident_id: c.resident_id,
              amount: Number(c.amount),
              paid_amount: Number(c.paid_amount),
              due_date: c.due_date,
              period_start: c.period_start,
              period_end: c.period_end,
              charge_type: c.charge_type,
            }))}
          />
        )}
      </div>

      {/* Resident view — Payment Terms card + Upcoming/Past tabs
          with next-due hero, open charges, and receipts. */}
      {user.role === "resident" && (
        <ResidentPaymentsView
          terms={residentTerms}
          openCharges={openChargeRows.map((c) => ({
            id: c.id,
            charge_type: c.charge_type,
            amount: Number(c.amount),
            paid_amount: Number(c.paid_amount),
            due_date: c.due_date,
            period_start: c.period_start,
            period_end: c.period_end,
            status: c.status,
          }))}
          payments={(payments ?? []).map((p) => ({
            id: p.id as string,
            amount: Number(p.amount),
            payment_type: (p.payment_type as string | null) ?? null,
            payment_method: (p.payment_method as string | null) ?? null,
            paid_at: p.paid_at as string,
            status: p.status as string,
            receipt_number: (p.receipt_number as string | null) ?? null,
            receipt_storage_path:
              (p.receipt_storage_path as string | null) ?? null,
            note: (p.note as string | null) ?? null,
          }))}
        />
      )}

      {isStaff && (
        <>
          <RentStructureCard
            commitments={commitments}
            houses={houses}
            existingConfigs={configMap}
          />

          <RentFlowKpis
            charges={monthCharges}
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
                  receipt_number:
                    (p.receipt_number as string | null) ?? null,
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
      )}
    </div>
  );
}
