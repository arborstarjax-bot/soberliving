import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DollarSign, AlertCircle } from "lucide-react";
import { CreatePaymentDialog } from "./create-payment-dialog";
import { VoidPaymentDialog } from "./void-payment-dialog";
import { DeletePaymentDialog } from "./delete-payment-dialog";
import { RecordChargePaymentDialog } from "./record-charge-payment-dialog";
import { RentConfigDialog } from "./rent-config-dialog";
import { DownloadReceiptButton } from "./download-receipt-button";
import { Pagination } from "@/components/pagination";
import { getPageParams, buildPaginationMeta } from "@/lib/pagination";
import {
  sweepOpenChargesForActiveCommitments,
  openAllChargesForCommitment,
} from "@/lib/payments/charges";
import { ResidentPaymentsView } from "./resident-view";
import { PaymentsByResident } from "./payments-by-resident";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDueDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPaymentTypeBadgeVariant(type: string) {
  switch (type) {
    case "rent":
      return "default" as const;
    case "deposit":
      return "secondary" as const;
    case "fee":
      return "outline" as const;
    default:
      return "outline" as const;
  }
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "completed":
      return "default" as const;
    case "pending":
      return "secondary" as const;
    case "refunded":
      return "outline" as const;
    case "void":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function formatPaymentMethod(method: string | null) {
  if (!method) return "";
  return method.replace(/_/g, " ");
}

interface PaymentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const isStaff = user.role === "admin" || user.role === "manager";

  const params = await searchParams;
  const { page, offset, pageSize } = getPageParams(params);

  // Lazy "cron" — on each staff page load, walk every active
  // commitment and open any missing monthly charges. Idempotent via
  // the (resident_id, due_date, charge_type) unique index. Keeps the
  // schedule current without a scheduled job.
  if (isStaff) {
    try {
      await sweepOpenChargesForActiveCommitments(houseFilter ?? null);
    } catch (e) {
      console.error("Charge sweep failed", e);
    }
  }

  // For residents, look up their resident record to filter payments.
  // This has to happen before the payments query runs because the filter
  // depends on its id, but every other query runs in parallel after.
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

    // Pull the active commitment for the Payment Terms card. Treat
    // this as display-only — the source of truth stays on the signed
    // PDF; terms changes flow through a new commitment amendment.
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
      if (commitment) {
        // Backfill any missing charges for this resident's commitment
        // before we read charges below. Residents never hit the staff
        // sweep, so this is the only path that keeps their Next Due
        // card current.
        if (commitment.id) {
          try {
            await openAllChargesForCommitment(commitment.id as string);
          } catch (e) {
            console.error("Resident charge backfill failed", e);
          }
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

  // Payments list — paginated so the grid doesn't try to render 1000+
  // rows at once when a facility has been running for a while.
  let paymentsQuery = supabase
    .from("payments")
    .select(
      "*, resident:residents(full_name), house:houses(name), recorder:users!recorded_by(full_name)",
      { count: "exact" }
    )
    .order("paid_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (user.role === "resident" && residentRecord) {
    paymentsQuery = paymentsQuery.eq("resident_id", residentRecord.id);
  } else if (houseFilter) {
    paymentsQuery = paymentsQuery.in("house_id", houseFilter);
  }

  // Open charges — powers the staff "Open Balances" column and the
  // dialog's "Apply to Charge" selector.
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

  // Staff-only aggregation / dialog data. Build queries up front and
  // fire them in one Promise.all so the page doesn't wait sequentially.
  let completedStatsQuery = isStaff
    ? supabase.from("payments").select("amount").eq("status", "completed")
    : null;
  if (completedStatsQuery && houseFilter) {
    completedStatsQuery = completedStatsQuery.in("house_id", houseFilter);
  }

  let housesQuery = isStaff
    ? supabase.from("houses").select("id, name").eq("is_active", true).order("name")
    : null;
  if (housesQuery && houseFilter) housesQuery = housesQuery.in("id", houseFilter);

  let residentsQuery = isStaff
    ? supabase
        .from("residents")
        .select("id, full_name, house_id")
        .eq("status", "active")
        .order("full_name")
    : null;
  if (residentsQuery && houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);

  let rentConfigsQuery = isStaff
    ? supabase
        .from("rent_configs")
        .select("house_id, monthly_amount, due_day_of_month")
        .eq("is_active", true)
    : null;
  if (rentConfigsQuery && houseFilter) rentConfigsQuery = rentConfigsQuery.in("house_id", houseFilter);

  const nullRes = Promise.resolve({ data: null });

  const [
    { data: payments, count: paymentsCount },
    { data: openCharges },
    completedRes,
    housesRes,
    residentsRes,
    rentConfigsRes,
  ] = await Promise.all([
    paymentsQuery,
    openChargesQuery,
    completedStatsQuery ?? nullRes,
    housesQuery ?? nullRes,
    residentsQuery ?? nullRes,
    rentConfigsQuery ?? nullRes,
  ]);

  const meta = buildPaginationMeta(paymentsCount ?? 0, page, pageSize);
  const completedData = completedRes.data ?? [];
  const completedCount = completedData.length;
  const totalCollected = completedData.reduce((sum, p) => sum + Number(p.amount), 0);
  const houses = housesRes.data ?? [];
  const residents = residentsRes.data ?? [];
  const rentConfigs = rentConfigsRes.data ?? [];
  const openChargeRows = openCharges ?? [];

  const todayIso = new Date().toISOString().slice(0, 10);

  // "Outstanding" means currently owed — due today or past due. Future
  // charges (partial or not) are upcoming balances, not outstanding
  // yet. We still keep the full list (openChargeRows) for the
  // "By Resident" tab and dialog selectors since those want the
  // complete schedule.
  const dueChargeRows = openChargeRows.filter(
    (c) => (c.due_date as string) <= todayIso
  );
  const totalOpenBalance = dueChargeRows.reduce(
    (s, c) => s + (Number(c.amount) - Number(c.paid_amount)),
    0
  );
  const pastDueCount = dueChargeRows.filter(
    (c) => (c.due_date as string) < todayIso
  ).length;

  const configMap: Record<
    string,
    {
      house_id: string;
      monthly_amount: number;
      due_day_of_month: number;
    }
  > = {};
  for (const rc of rentConfigs) {
    configMap[rc.house_id] = rc;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-muted-foreground">
            Track rent payments and fees
          </p>
        </div>
        {isStaff && (
          <div className="flex gap-2">
            <RentConfigDialog houses={houses} existingConfigs={configMap} />
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
          </div>
        )}
      </div>

      {/* Resident view — Payment Terms card + Upcoming/Past tabs
          with next-due hero, open charges, and paginated receipts. */}
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totalCollected)}
              </div>
              <p className="text-xs text-muted-foreground">
                {completedCount} payments
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Balances</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totalOpenBalance)}
              </div>
              <p className="text-xs text-muted-foreground">
                {openChargeRows.length} open · {pastDueCount} past due
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rent Config</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {Object.keys(configMap).length > 0 ? (
                <div className="text-sm">
                  {(houses ?? [])
                    .filter((h) => configMap[h.id])
                    .map((h) => (
                      <div key={h.id} className="flex justify-between">
                        <span className="text-muted-foreground">{h.name}</span>
                        <span className="font-medium">
                          {formatCurrency(configMap[h.id].monthly_amount)}/mo
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No rent configured
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Staff view splits Open Balances and the Payment Log into
          tabs so the page stops looking like a single scrolling wall.
          Residents keep the simple "Next Due card + history" flow —
          no tabs, they only ever have one view. */}
      {isStaff ? (
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
                id: r.id as string,
                full_name: (r.full_name as string) ?? "",
                house_id: (r.house_id as string) ?? "",
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
            {dueChargeRows.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">
                    Nothing outstanding — everyone&apos;s caught up.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {dueChargeRows.map((c) => {
                      const resident =
                        (c.resident as unknown as { full_name: string } | null)
                          ?.full_name ?? "Unknown";
                      const houseName =
                        (c.house as unknown as { name: string } | null)?.name ?? "";
                      const balance =
                        Number(c.amount) - Number(c.paid_amount);
                      const pastDue = c.due_date < todayIso;
                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={pastDue ? "destructive" : "outline"}
                                className="capitalize text-[10px]"
                              >
                                {c.charge_type.replace(/_/g, " ")}
                              </Badge>
                              <span className="font-medium truncate">
                                {resident}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Due {formatDueDate(c.due_date)} · {houseName}
                              {Number(c.paid_amount) > 0 && (
                                <>
                                  {" · "}
                                  {formatCurrency(Number(c.paid_amount))} of{" "}
                                  {formatCurrency(Number(c.amount))} paid
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={`font-semibold ${
                                pastDue ? "text-destructive" : ""
                              }`}
                            >
                              {formatCurrency(balance)}
                            </span>
                            <RecordChargePaymentDialog
                              residentId={c.resident_id as string}
                              residentName={resident}
                              houseId={c.house_id as string}
                              charge={{
                                id: c.id as string,
                                charge_type: c.charge_type as string,
                                amount: Number(c.amount),
                                paid_amount: Number(c.paid_amount),
                                due_date: c.due_date as string,
                                period_start:
                                  (c.period_start as string | null) ?? null,
                                period_end:
                                  (c.period_end as string | null) ?? null,
                              }}
                              variant={pastDue ? "default" : "outline"}
                              size="sm"
                              label="Record Payment"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="paid" className="mt-4">
            <PaymentLedgerList
              payments={payments ?? []}
              userRole={user.role}
              meta={meta}
              params={params}
            />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

// Shared paginated list of recorded payments used by both the staff
// "Paid" tab and the resident payment-history view. Residents never
// see the void button (admin-only gate inside the row).
/* eslint-disable @typescript-eslint/no-explicit-any */
function PaymentLedgerList({
  payments,
  userRole,
  meta,
  params,
}: {
  payments: any[];
  userRole: string;
  meta: ReturnType<typeof buildPaginationMeta>;
  params: Record<string, string | string[] | undefined>;
}) {
/* eslint-enable @typescript-eslint/no-explicit-any */
  if (payments.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No payments recorded</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <div className="space-y-2">
        {payments.map((payment) => {
              const residentName =
                (payment.resident as unknown as { full_name: string } | null)
                  ?.full_name ?? "Unknown";
              const houseName =
                (payment.house as unknown as { name: string } | null)?.name ?? "";
              const recorderName =
                (payment.recorder as unknown as { full_name: string } | null)
                  ?.full_name ?? "";

              return (
                <Card key={payment.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          variant={getPaymentTypeBadgeVariant(
                            payment.payment_type
                          )}
                          className="capitalize"
                        >
                          {payment.payment_type}
                        </Badge>
                        <span className="font-semibold">
                          {formatCurrency(Number(payment.amount))}
                        </span>
                        <span className="font-medium text-sm truncate">
                          {residentName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant={getStatusBadgeVariant(payment.status)}
                          className="capitalize"
                        >
                          {payment.status}
                        </Badge>
                        {payment.receipt_storage_path && (
                          <DownloadReceiptButton
                            storagePath={payment.receipt_storage_path}
                            receiptNumber={payment.receipt_number ?? null}
                          />
                        )}
                        {userRole === "admin" &&
                          payment.status !== "void" &&
                          payment.status !== "refunded" && (
                            <VoidPaymentDialog
                              paymentId={payment.id}
                              amount={Number(payment.amount)}
                              residentName={residentName}
                            />
                          )}
                        {userRole === "admin" && (
                          <DeletePaymentDialog
                            paymentId={payment.id}
                            amount={Number(payment.amount)}
                            residentName={residentName}
                          />
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        {payment.paid_at
                          ? new Date(payment.paid_at).toLocaleDateString()
                          : payment.status}
                      </span>
                      {payment.payment_method && (
                        <span className="capitalize">
                          · {formatPaymentMethod(payment.payment_method)}
                        </span>
                      )}
                      <span>· {houseName}</span>
                      {payment.receipt_number && (
                        <span className="font-mono">
                          · {payment.receipt_number}
                        </span>
                      )}
                      {recorderName && <span>· Recorded by {recorderName}</span>}
                      {payment.period_start && payment.period_end && (
                        <span>
                          · Period:{" "}
                          {new Date(payment.period_start).toLocaleDateString()} –{" "}
                          {new Date(payment.period_end).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {payment.note && (
                      <p className="text-sm mt-1 text-muted-foreground">
                        {payment.note}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
        })}
      </div>
      <Pagination
        meta={meta}
        basePath="/payments"
        searchParams={params}
        itemLabel="payments"
      />
    </>
  );
}
