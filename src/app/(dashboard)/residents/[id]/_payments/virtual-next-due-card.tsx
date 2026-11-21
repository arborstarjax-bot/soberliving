"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Calendar } from "lucide-react";
import { RecordUpcomingRentDialog } from "@/app/(dashboard)/payments/record-upcoming-rent-dialog";
import { dayOfMonthLocal } from "@/lib/local-date";
import type { PaymentTerms, PendingAmendment } from "./types";
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
  pendingAmendment,
  canRecordPayment,
  residentId,
  residentName,
  houseId,
}: {
  terms: PaymentTerms;
  // When a pending amendment exists with a future effective date we
  // project the Next Rent card off of it instead of the (still
  // active) parent commitment — otherwise the card reads "$X due next
  // Sunday" even though the admin has already decided the new cycle
  // will anchor on Friday 4/17. The admin hasn't literally changed
  // the schedule yet (resident signature is pending), but showing the
  // old cadence is misleading so we visually roll forward.
  pendingAmendment: PendingAmendment | null;
  canRecordPayment: boolean;
  residentId: string;
  residentName: string;
  houseId: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const projection = projectFromAmendment(pendingAmendment, today);

  const effectiveTerms: PaymentTerms = projection
    ? {
        ...terms,
        rent_amount: projection.rentAmount,
        commitment_start_date: projection.anchorIso,
        payment_frequency: projection.frequency,
      }
    : terms;

  // When projecting off a future-dated amendment, that effective
  // date IS the next cycle anchor — no need to roll forward from
  // today. For amendments whose effective date is already in the
  // past (resident just hasn't signed yet), fall back to the
  // regular computeNextDue so we don't show a stale date.
  const anchor =
    projection && projection.anchorDate.getTime() >= today.getTime()
      ? projection.anchorDate
      : computeNextDue(effectiveTerms, today);
  // Policy: rent is due the day BEFORE the cycle anchor. Render
  // that shifted date as the "Due on …" value so this card matches
  // the rate clause on the signed commitment PDF and the real
  // payment_charges row the opener will eventually create.
  const dueDate = new Date(anchor);
  dueDate.setDate(dueDate.getDate() - 1);
  const msDay = 24 * 60 * 60 * 1000;
  const days = Math.round(
    (dueDate.getTime() - today.getTime()) / msDay
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
              {formatMoney(effectiveTerms.rent_amount)}
            </p>
            <p className="text-sm text-muted-foreground">
              {projection
                ? "Once amendment is signed — not yet charged"
                : "Opens on due day — no charge yet"}
            </p>
          </div>
          <Badge variant="outline" className="whitespace-nowrap">
            {days < 0
              ? `${Math.abs(days)}d ago`
              : days === 0
                ? "Due today"
                : days === 1
                  ? "Due tomorrow"
                  : `Due in ${days}d`}
          </Badge>
        </div>
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              Due {dueDate.toLocaleDateString("en-US", { timeZone: "America/New_York" })}
            </span>
          </div>
          <span className="pl-5 text-[11px]">
            Covers cycle starting{" "}
            {anchor.toLocaleDateString("en-US", { timeZone: "America/New_York" })}
          </span>
        </div>
        {canRecordPayment && !projection && (
          <div className="pt-2 border-t">
            <RecordUpcomingRentDialog
              commitmentId={terms.commitment_id}
              residentId={residentId}
              residentName={residentName}
              houseId={houseId}
              rentAmount={terms.rent_amount}
              nextDueDate={toIsoLocal(dueDate)}
              size="default"
              label={`Record Payment · ${formatMoney(terms.rent_amount)}`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Derive the projected Next Rent anchor from a pending amendment.
// Returns null when the amendment doesn't carry enough info to
// project (missing effective_date / payment_frequency on rows
// created before those columns were captured). Callers fall back
// to the active commitment's terms in that case.
function projectFromAmendment(
  pa: PendingAmendment | null,
  today: Date
):
  | {
      anchorDate: Date;
      anchorIso: string;
      rentAmount: number;
      frequency: "weekly" | "monthly";
    }
  | null {
  if (!pa || !pa.effective_date || !pa.payment_frequency) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pa.effective_date);
  if (!m) return null;
  const [, y, mo, d] = m;
  const anchorDate = new Date(Number(y), Number(mo) - 1, Number(d));
  anchorDate.setHours(0, 0, 0, 0);
  // If the amendment's effective date is already behind us (resident
  // hasn't signed yet), fall back to the active commitment's
  // computation. Null from here → caller uses `terms` directly.
  if (anchorDate.getTime() < today.getTime()) return null;
  return {
    anchorDate,
    anchorIso: pa.effective_date,
    rentAmount: pa.rent_amount,
    frequency: pa.payment_frequency,
  };
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

// Derive the next upcoming cycle anchor date from the resident's
// payment terms. Callers shift `anchor - 1 day` to get the actual
// due date (policy: rent is due the day BEFORE the cycle anchor).
//
// Key invariant: the returned anchor must satisfy `anchor - 1 >= today`,
// i.e. `anchor > today`. When today IS the anchor day, the real charge
// for that cycle was already opened yesterday (opener fires when
// `due_date = anchor - 1 <= today`), so the "upcoming" anchor we want
// to surface is the NEXT one. Weekly rolls to +7 days; monthly rolls
// to the next month. Without this guard the virtual card displays
// "1d ago / past due" on every anchor day for every weekly/monthly
// resident.
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
    const rawDiff = (startWeekday - today.getDay() + 7) % 7;
    // Skip today → full week when today IS the anchor weekday.
    const diff = rawDiff === 0 ? 7 : rawDiff;
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
  // `<=` (not `<`) so we roll forward when candidate equals today —
  // today's cycle already has a real open charge if any.
  if (candidate.getTime() <= today.getTime()) {
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
