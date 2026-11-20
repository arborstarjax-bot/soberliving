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
import {
  computeRentDueDate,
  nextDueDate,
  normalizePaymentFrequency,
  parseIsoDate,
  toIsoDate,
} from "@/lib/payments/charges";
import type { PaymentFrequency } from "@/lib/payments/charges";
import type { SessionUser } from "@/lib/types";
import { PaymentsByResident } from "./payments-by-resident";
import { PaidLedger } from "./paid-ledger";

function computeDateBounds(): {
  todayIso: string;
  monthStartIso: string;
  monthEndIso: string;
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
  return { todayIso, monthStartIso, monthEndIso };
}

/**
 * Staff payments body — one Rent Roll tab (every resident, their rent
 * terms, next due, balance, record/edit actions) plus a History tab
 * of recorded payments. Rent itself is simple: weekly or monthly,
 * set on the resident's commitment, and a charge opens on each due
 * date via the daily sweep. Everything staff need day-to-day is one
 * row per resident.
 */
export async function StaffPaymentsSection({ user }: { user: SessionUser }) {
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const { todayIso, monthStartIso, monthEndIso } = computeDateBounds();

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
      "id, resident_id, house_id, charge_type, amount, paid_amount, due_date, period_start, period_end, status"
    )
    .in("status", ["open", "partial"])
    .order("due_date", { ascending: true });
  if (houseFilter) openChargesQuery = openChargesQuery.in("house_id", houseFilter);

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
    .select(
      "id, resident_id, house_id, rent_amount, admin_fee, payment_frequency, commitment_start_date, billing_anchor_date"
    )
    .eq("status", "active")
    .not("resident_id", "is", null);
  if (houseFilter) commitmentsQuery = commitmentsQuery.in("house_id", houseFilter);

  const [
    { data: payments },
    { data: openCharges },
    { data: housesData },
    { data: residentsData },
    { data: commitmentsData },
  ] = await Promise.all([
    paymentsQuery,
    openChargesQuery,
    housesQuery,
    residentsQuery,
    commitmentsQuery,
  ]);

  const houses = (housesData ?? []) as { id: string; name: string }[];
  const residents = (residentsData ?? []) as {
    id: string;
    full_name: string;
    house_id: string;
  }[];
  const commitments = (commitmentsData ?? []) as {
    id: string;
    resident_id: string;
    house_id: string;
    rent_amount: number;
    admin_fee: number | null;
    payment_frequency: string | null;
    commitment_start_date: string;
    billing_anchor_date: string | null;
  }[];
  const openChargeRows = openCharges ?? [];

  // Existing rent anchors per commitment, to compute each resident's
  // virtual next due when no charge is open yet.
  const commitmentIds = commitments.map((c) => c.id);
  const { data: rentAnchors } = commitmentIds.length
    ? await supabase
        .from("payment_charges")
        .select("commitment_id, due_date, period_start")
        .eq("charge_type", "rent")
        .in("commitment_id", commitmentIds)
    : { data: [] };
  const anchorsByCommitment = new Map<string, Date[]>();
  for (const r of rentAnchors ?? []) {
    const iso = (r.period_start ?? r.due_date) as string;
    const list = anchorsByCommitment.get(r.commitment_id as string) ?? [];
    list.push(parseIsoDate(iso));
    anchorsByCommitment.set(r.commitment_id as string, list);
  }

  const termsByResident = new Map<
    string,
    {
      commitmentId: string;
      rentAmount: number;
      adminFee: number | null;
      frequency: PaymentFrequency;
      nextDueIso: string | null;
    }
  >();
  for (const c of commitments) {
    const frequency = normalizePaymentFrequency(c.payment_frequency);
    const start = parseIsoDate(
      c.billing_anchor_date ?? c.commitment_start_date
    );
    const anchor = nextDueDate(
      start,
      anchorsByCommitment.get(c.id) ?? [],
      frequency
    );
    termsByResident.set(c.resident_id, {
      commitmentId: c.id,
      rentAmount: Number(c.rent_amount),
      adminFee: c.admin_fee === null ? null : Number(c.admin_fee),
      frequency,
      nextDueIso: toIsoDate(computeRentDueDate(anchor)),
    });
  }

  const dueChargeRows = openChargeRows.filter(
    (c) => (c.due_date as string) <= todayIso
  );
  const pastDueCount = dueChargeRows.filter(
    (c) => (c.due_date as string) < todayIso
  ).length;

  return (
    <Tabs defaultValue="rent-roll">
      <TabsList>
        <TabsTrigger value="rent-roll">
          Rent Roll
          {dueChargeRows.length > 0 && (
            <Badge
              variant={pastDueCount > 0 ? "destructive" : "secondary"}
              className="ml-1.5 h-5 px-1.5 text-xs"
            >
              {dueChargeRows.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="rent-roll" className="mt-4">
        <PaymentsByResident
          residents={residents.map((r) => {
            const terms = termsByResident.get(r.id) ?? null;
            return {
              id: r.id,
              full_name: r.full_name ?? "",
              house_id: r.house_id ?? "",
              house_name:
                houses.find((h) => h.id === r.house_id)?.name ?? "",
              commitment_id: terms?.commitmentId ?? null,
              rent_amount: terms?.rentAmount ?? null,
              admin_fee: terms?.adminFee ?? null,
              payment_frequency: terms?.frequency ?? null,
              next_due: terms?.nextDueIso ?? null,
            };
          })}
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

      <TabsContent value="history" className="mt-4">
        <PaidLedger
          payments={(payments ?? []).map((p) => {
            const resident = Array.isArray(p.resident) ? p.resident[0] : p.resident;
            const house = Array.isArray(p.house) ? p.house[0] : p.house;
            const recorder = Array.isArray(p.recorder) ? p.recorder[0] : p.recorder;
            return {
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
              (resident as { full_name?: string } | null)?.full_name ?? "Unknown",
            house_name:
              (house as { name?: string } | null)?.name ?? "",
            recorder_name:
              (recorder as { full_name?: string } | null)?.full_name ?? "",
            };
          })}
          userRole={user.role}
          todayIso={todayIso}
          monthStartIso={monthStartIso}
          monthEndIso={monthEndIso}
        />
      </TabsContent>
    </Tabs>
  );
}
