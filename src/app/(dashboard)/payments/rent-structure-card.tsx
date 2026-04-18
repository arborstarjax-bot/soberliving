// Rent Structure is the first thing staff should see on /payments.
// It answers the question "what does this facility charge?" in plain
// numbers before any receipts / charges / KPIs. The numbers are
// derived from the active commitments rather than a separate config
// table so the card can never disagree with reality.
//
// If every active commitment agrees we show a single value
// ($225 / week, $800 / month, $200 admin). If commitments disagree
// (e.g. one resident is grandfathered at $200) we show a range so the
// variation is visible rather than silently averaged.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RentConfigDialog } from "./rent-config-dialog";

interface ActiveCommitment {
  payment_frequency: string | null;
  rent_amount: number;
  admin_fee: number | null;
}

interface Props {
  commitments: ActiveCommitment[];
  houses: { id: string; name: string }[];
  existingConfigs: Record<
    string,
    { house_id: string; monthly_amount: number; due_day_of_month: number }
  >;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

// Collapse a list of numbers into either "$X" or "$lo – $hi". Used to
// keep the card honest when rates vary across residents.
function formatRange(values: number[]): string | null {
  const set = Array.from(new Set(values.filter((v) => v > 0)));
  if (set.length === 0) return null;
  if (set.length === 1) return formatCurrency(set[0]);
  const lo = Math.min(...set);
  const hi = Math.max(...set);
  return `${formatCurrency(lo)} – ${formatCurrency(hi)}`;
}

export function RentStructureCard({
  commitments,
  houses,
  existingConfigs,
}: Props) {
  const weeklyAmounts = commitments
    .filter((c) => (c.payment_frequency ?? "monthly") === "weekly")
    .map((c) => Number(c.rent_amount ?? 0));
  const monthlyAmounts = commitments
    .filter((c) => (c.payment_frequency ?? "monthly") === "monthly")
    .map((c) => Number(c.rent_amount ?? 0));
  const adminFees = commitments
    .map((c) => Number(c.admin_fee ?? 0))
    .filter((a) => a > 0);

  const weeklyLabel = formatRange(weeklyAmounts) ?? "$225";
  const monthlyLabel = formatRange(monthlyAmounts) ?? "$800";
  const adminLabel = formatRange(adminFees) ?? "$200";

  // "Default" when there's nothing on the books yet — the numbers
  // come from the house policy David specified. Once commitments
  // start landing these switch to "derived from N active residents."
  const monthlyCount = monthlyAmounts.length;
  const weeklyCount = weeklyAmounts.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Rent Structure</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What this facility charges. Rates come from active commitments.
          </p>
        </div>
        <RentConfigDialog houses={houses} existingConfigs={existingConfigs} />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Weekly Rent
              </span>
              {weeklyCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {weeklyCount} resident{weeklyCount === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <div className="mt-1 text-xl font-semibold">{weeklyLabel}</div>
            <p className="text-[11px] text-muted-foreground">per week</p>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Monthly Rent
              </span>
              {monthlyCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {monthlyCount} resident{monthlyCount === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <div className="mt-1 text-xl font-semibold">{monthlyLabel}</div>
            <p className="text-[11px] text-muted-foreground">per month</p>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Admin Fee
              </span>
            </div>
            <div className="mt-1 text-xl font-semibold">{adminLabel}</div>
            <p className="text-[11px] text-muted-foreground">
              one-time at move-in
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
