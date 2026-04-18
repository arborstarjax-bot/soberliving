// Rent-flow KPIs replace the old "Total Collected" lifetime card.
// Lifetime revenue isn't actionable — what matters on a day-to-day
// basis is: how much rent did we actually collect this month, how
// much was expected, how much is past due, and what's about to come
// due. These four tiles are the only numbers staff glance at before
// diving into Outstanding.
//
// Computed inline on the server so no extra round-trip is needed.
// Currency formatting matches the rest of the payments hub.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface ChargeRow {
  amount: number;
  paid_amount: number;
  due_date: string; // YYYY-MM-DD
  status: string;
  charge_type: string;
}

interface PaymentRow {
  amount: number;
  paid_at: string; // timestamptz ISO
  status: string;
}

interface Props {
  charges: ChargeRow[];
  payments: PaymentRow[];
  todayIso: string; // YYYY-MM-DD in Eastern
  monthStartIso: string; // YYYY-MM-01 in Eastern
  monthEndIso: string; // last day of the month in Eastern
  weekAheadIso: string; // today + 7 days in Eastern
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export function RentFlowKpis({
  charges,
  payments,
  todayIso,
  monthStartIso,
  monthEndIso,
  weekAheadIso,
}: Props) {
  // Collected this month: sum of completed payments whose paid_at is
  // within the month window. Payments are timestamptz so we compare
  // the ISO prefix — good enough since the month bounds already came
  // in as Eastern-local YYYY-MM-DD strings.
  const collectedThisMonth = payments
    .filter((p) => p.status === "completed")
    .filter((p) => {
      const paidIso = p.paid_at.slice(0, 10);
      return paidIso >= monthStartIso && paidIso <= monthEndIso;
    })
    .reduce((sum, p) => sum + Number(p.amount), 0);

  // Expected this month: every rent/admin_fee charge whose due_date
  // falls in the month. Includes paid ones — expected is the full
  // amount we expected to bill, not just what's still open.
  const expectedChargesThisMonth = charges.filter(
    (c) =>
      c.due_date >= monthStartIso &&
      c.due_date <= monthEndIso &&
      c.status !== "void"
  );
  const expectedThisMonth = expectedChargesThisMonth.reduce(
    (s, c) => s + Number(c.amount),
    0
  );

  // Past due: open/partial charges whose due_date is strictly before
  // today. We report both the money owed and the count of charges.
  const pastDueCharges = charges.filter(
    (c) =>
      (c.status === "open" || c.status === "partial") && c.due_date < todayIso
  );
  const pastDueAmount = pastDueCharges.reduce(
    (s, c) => s + (Number(c.amount) - Number(c.paid_amount)),
    0
  );

  // Due next 7 days: open charges due on or after today AND ≤ today+7.
  // Partial already paid charges count at their remaining balance.
  const dueSoonCharges = charges.filter(
    (c) =>
      (c.status === "open" || c.status === "partial") &&
      c.due_date >= todayIso &&
      c.due_date <= weekAheadIso
  );
  const dueSoonAmount = dueSoonCharges.reduce(
    (s, c) => s + (Number(c.amount) - Number(c.paid_amount)),
    0
  );

  // Collection rate % as a sanity check on "Collected vs Expected."
  // Only shown when we have a meaningful expected amount to avoid
  // blasting "0%" at month-start when no charges have rolled yet.
  const rate =
    expectedThisMonth > 0
      ? Math.round((collectedThisMonth / expectedThisMonth) * 100)
      : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Collected This Month
          </CardTitle>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(collectedThisMonth)}
          </div>
          <p className="text-xs text-muted-foreground">
            {rate !== null ? `${rate}% of expected` : "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Expected This Month
          </CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(expectedThisMonth)}
          </div>
          <p className="text-xs text-muted-foreground">
            {expectedChargesThisMonth.length} charge
            {expectedChargesThisMonth.length === 1 ? "" : "s"} scheduled
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Past Due</CardTitle>
          <AlertCircle
            className={`h-4 w-4 ${
              pastDueCharges.length > 0
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          />
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold ${
              pastDueCharges.length > 0 ? "text-destructive" : ""
            }`}
          >
            {formatCurrency(pastDueAmount)}
          </div>
          <p className="text-xs text-muted-foreground">
            {pastDueCharges.length} charge
            {pastDueCharges.length === 1 ? "" : "s"} overdue
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Due Next 7 Days</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(dueSoonAmount)}
          </div>
          <p className="text-xs text-muted-foreground">
            {dueSoonCharges.length} upcoming charge
            {dueSoonCharges.length === 1 ? "" : "s"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
