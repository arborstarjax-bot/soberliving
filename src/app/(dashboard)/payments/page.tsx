import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";
import { CreatePaymentDialog } from "./create-payment-dialog";
import { VoidPaymentDialog } from "./void-payment-dialog";
import { RentConfigDialog } from "./rent-config-dialog";

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

export default async function PaymentsPage() {
  const user = await requireAuth();
  const supabase = await createClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const isStaff = user.role === "admin" || user.role === "manager";

  // For residents, look up their resident record to filter payments
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

  // Payments list
  let paymentsQuery = supabase
    .from("payments")
    .select(
      "*, resident:residents(full_name), house:houses(name), recorder:users!recorded_by(full_name)"
    )
    .order("paid_at", { ascending: false })
    .limit(100);

  if (user.role === "resident" && residentRecord) {
    paymentsQuery = paymentsQuery.eq("resident_id", residentRecord.id);
  } else if (houseFilter) {
    paymentsQuery = paymentsQuery.in("house_id", houseFilter);
  }

  const { data: payments } = await paymentsQuery;

  // Separate aggregation queries for accurate summary stats (not subject to .limit(100))
  let completedCount = 0;
  let totalCollected = 0;
  let pendingCount = 0;
  let totalPending = 0;

  if (isStaff) {
    // Completed payments stats
    let completedStatsQuery = supabase
      .from("payments")
      .select("amount")
      .eq("status", "completed");
    if (user.role === "resident" && residentRecord) {
      completedStatsQuery = completedStatsQuery.eq("resident_id", residentRecord.id);
    } else if (houseFilter) {
      completedStatsQuery = completedStatsQuery.in("house_id", houseFilter);
    }
    const { data: completedData } = await completedStatsQuery;
    completedCount = (completedData ?? []).length;
    totalCollected = (completedData ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

    // Pending payments stats
    let pendingStatsQuery = supabase
      .from("payments")
      .select("amount")
      .eq("status", "pending");
    if (user.role === "resident" && residentRecord) {
      pendingStatsQuery = pendingStatsQuery.eq("resident_id", residentRecord.id);
    } else if (houseFilter) {
      pendingStatsQuery = pendingStatsQuery.in("house_id", houseFilter);
    }
    const { data: pendingData } = await pendingStatsQuery;
    pendingCount = (pendingData ?? []).length;
    totalPending = (pendingData ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  }

  // Houses, residents, and rent configs only needed for staff dialogs
  let houses: { id: string; name: string }[] = [];
  let residents: { id: string; full_name: string; house_id: string }[] = [];
  let rentConfigs: {
    house_id: string;
    monthly_amount: number;
    due_day_of_month: number;
    late_fee: number;
    grace_period_days: number;
  }[] = [];

  if (isStaff) {
    let housesQuery = supabase
      .from("houses")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    if (houseFilter) housesQuery = housesQuery.in("id", houseFilter);
    const { data: housesData } = await housesQuery;
    houses = housesData ?? [];

    let residentsQuery = supabase
      .from("residents")
      .select("id, full_name, house_id")
      .eq("status", "active")
      .order("full_name");
    if (houseFilter) residentsQuery = residentsQuery.in("house_id", houseFilter);
    const { data: residentsData } = await residentsQuery;
    residents = residentsData ?? [];

    let rentConfigsQuery = supabase
      .from("rent_configs")
      .select("house_id, monthly_amount, due_day_of_month, late_fee, grace_period_days")
      .eq("is_active", true);
    if (houseFilter) rentConfigsQuery = rentConfigsQuery.in("house_id", houseFilter);
    const { data: rentConfigsData } = await rentConfigsQuery;
    rentConfigs = rentConfigsData ?? [];
  }

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
                      {new Date(payment.paid_at).toLocaleDateString()}
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
      )}
    </div>
  );
}
