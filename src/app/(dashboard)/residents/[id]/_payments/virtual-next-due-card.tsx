"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Calendar } from "lucide-react";
import { RecordUpcomingRentDialog } from "@/app/(dashboard)/payments/record-upcoming-rent-dialog";
import { dayOfMonthLocal } from "@/lib/local-date";
import type { PaymentTerms } from "./types";
import { formatMoney } from "./helpers";

// Shown when the resident has no open charges on the books — the next
// rent cycle hasn't arrived yet, so there's no row to render. We
// compute the upcoming due date from the payment terms so staff /
// residents still see when the next bill lands and how much it's for.
// This is purely informational: no DB row is created, no action is
// possible on it, and it disappears as soon as the opener creates the
// real charge (the morning of the due day).
export function VirtualNextDueCard({
  terms,
  canRecordPayment,
  residentId,
  residentName,
  houseId,
}: {
  terms: PaymentTerms;
  canRecordPayment: boolean;
  residentId: string;
  residentName: string;
  houseId: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidate = computeNextDue(terms, today);
  const msDay = 24 * 60 * 60 * 1000;
  const days = Math.round(
    (candidate.getTime() - today.getTime()) / msDay
  );
  return (
    <Card>
      <CardContent className="py-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Next Rent
            </p>
            <p className="text-2xl font-bold flex items-center gap-1.5">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              {formatMoney(terms.rent_amount)}
            </p>
            <p className="text-sm text-muted-foreground">
              Opens on due day — no charge yet
            </p>
          </div>
          <Badge variant="outline" className="whitespace-nowrap">
            {days === 0
              ? "Due today"
              : days === 1
                ? "Due tomorrow"
                : `Due in ${days}d`}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {candidate.toLocaleDateString("en-US", { timeZone: "America/New_York" })}
        </div>
        {canRecordPayment && (
          <div className="pt-2 border-t">
            <RecordUpcomingRentDialog
              commitmentId={terms.commitment_id}
              residentId={residentId}
              residentName={residentName}
              houseId={houseId}
              rentAmount={terms.rent_amount}
              nextDueDate={toIsoLocal(candidate)}
              size="default"
              label={`Record Payment · ${formatMoney(terms.rent_amount)}`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Local YYYY-MM-DD formatter — avoids the toISOString() UTC drift
// on the PDT boundary (which would shift the virtual due day by
// one on evenings in US Pacific).
function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Derive the next upcoming due date from the resident's payment terms.
// Monthly: roll to this month's due day, or next month's if already past
// today, clamping Jan-31 → Feb-28/29 the same way the opener does.
// Weekly: step forward to the same weekday as `commitment_start_date`,
// or today if today matches. Used by the Next Rent card and the
// Record Payment dialog pre-fill so both match what the opener
// will actually create.
function computeNextDue(
  terms: PaymentTerms,
  today: Date
): Date {
  if (terms.payment_frequency === "weekly") {
    // Parse the commitment start date-only string as UTC so the
    // weekday we read is the literal calendar weekday the admin
    // picked — not whatever it lands on in the viewer's TZ. Then
    // reproject that weekday onto today's local clock.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(terms.commitment_start_date);
    const startWeekday = m
      ? new Date(
          Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        ).getUTCDay()
      : today.getDay();
    const candidate = new Date(today);
    const diff = (startWeekday - today.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + diff);
    return candidate;
  }
  const dayOfMonth = dayOfMonthLocal(terms.commitment_start_date);
  const candidate = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayThis = new Date(
    candidate.getFullYear(),
    candidate.getMonth() + 1,
    0
  ).getDate();
  candidate.setDate(Math.min(dayOfMonth, lastDayThis));
  if (candidate.getTime() < today.getTime()) {
    candidate.setDate(1);
    candidate.setMonth(candidate.getMonth() + 1);
    const lastDayNext = new Date(
      candidate.getFullYear(),
      candidate.getMonth() + 1,
      0
    ).getDate();
    candidate.setDate(Math.min(dayOfMonth, lastDayNext));
  }
  return candidate;
}
