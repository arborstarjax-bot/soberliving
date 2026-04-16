import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";
import { CreatePaymentDialog } from "./create-payment-dialog";
import { VoidPaymentDialog } from "./void-payment-dialog";
import { RentConfigDialog } from "./rent-config-dialog";
import { Pagination } from "@/components/pagination";
import { getPageParams, buildPaginationMeta } from "@/lib/pagination";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
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

  // For residents, look up their resident record to filter payments.
  // This has to happen before the payments query runs because the filter
  // depends on its id, but every other query runs in parallel after.
  let residentRecord: { id: string } | null = null;
  if (user.role === "resident") {
    const { data } = await supabase
      .from("residents")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    residentRecord = data;
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

  // Staff-only aggregation / dialog data. Build all six queries up
  // front and fire them in one Promise.all so the page doesn't wait
  // for them sequentially.
  let completedStatsQuery = isStaff
    ? supabase.from("payments").select("amount").eq("status", "completed")
    : null;
  if (completedStatsQuery && houseFilter) {
    completedStatsQuery = completedStatsQuery.in("house_id", houseFilter);
  }

  let pendingStatsQuery = isStaff
    ? supabase.from("payments").select("amount").eq("status", "pending")
    : null;
  if (pendingStatsQuery && houseFilter) {
    pendingStatsQuery = pendingStatsQuery.in("house_id", houseFilter);
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
        .select("house_id, monthly_amount, due_day_of_month, late_fee, grace_period_days")
        .eq("is_active", true)
    : null;
  if (rentConfigsQuery && houseFilter) rentConfigsQuery = rentConfigsQuery.in("house_id", houseFilter);

  const nullRes = Promise.resolve({ data: null });

  const [
    { data: payments, count: paymentsCount },
    completedRes,
    pendingRes,
    housesRes,
    residentsRes,
    rentConfigsRes,
  ] = await Promise.all([
    paymentsQuery,
    completedStatsQuery ?? nullRes,
    pendingStatsQuery ?? nullRes,
    housesQuery ?? nullRes,
    residentsQuery ?? nullRes,
    rentConfigsQuery ?? nullRes,
  ]);

  const meta = buildPaginationMeta(paymentsCount ?? 0, page, pageSize);
  const completedData = completedRes.data ?? [];
  const pendingData = pendingRes.data ?? [];
  const completedCount = completedData.length;
  const totalCollected = completedData.reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingCount = pendingData.length;
  const totalPending = pendingData.reduce((sum, p) => sum + Number(p.amount), 0);
  const houses = housesRes.data ?? [];
  const residents = residentsRes.data ?? [];
  const rentConfigs = rentConfigsRes.data ?? [];

  const configMap: Record<
    string,
    {
      house_id: string;
      monthly_amount: number;
      due_day_of_month: number;
      late_fee: number;
      grace_period_days: number;
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
            <RentConfigDialog
              houses={houses}
              existingConfigs={configMap}
            />
            <CreatePaymentDialog
              houses={houses}
              residents={residents}
            />
          </div>
        )}
      </div>

      {isStaff && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Collected
              </CardTitle>
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
              <CardTitle className="text-sm font-medium">
                Pending
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totalPending)}
              </div>
              <p className="text-xs text-muted-foreground">
                {pendingCount} payments
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Rent Config
              </CardTitle>
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

      {(payments ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No payments recorded</p>
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="space-y-2">
          {(payments ?? []).map((payment) => {
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
                    <div className="flex items-center gap-2">
                      <Badge variant={getPaymentTypeBadgeVariant(payment.payment_type)} className="capitalize">
                        {payment.payment_type}
                      </Badge>
                      <span className="font-semibold">
                        {formatCurrency(Number(payment.amount))}
                      </span>
                      <span className="font-medium text-sm">
                        {residentName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={getStatusBadgeVariant(payment.status)}
                        className="capitalize"
                      >
                        {payment.status}
                      </Badge>
                      {isStaff &&
                        payment.status !== "void" &&
                        payment.status !== "refunded" && (
                          <VoidPaymentDialog
                            paymentId={payment.id}
                            amount={Number(payment.amount)}
                            residentName={residentName}
                          />
                        )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {payment.status === "pending" || !payment.paid_at
                        ? payment.status.charAt(0).toUpperCase() + payment.status.slice(1)
                        : new Date(payment.paid_at).toLocaleDateString()}
                    </span>
                    {payment.payment_method && (
                      <span className="capitalize">
                        · {formatPaymentMethod(payment.payment_method)}
                      </span>
                    )}
                    <span>· {houseName}</span>
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
      )}
    </div>
  );
}
