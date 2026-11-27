"use client";

// Resident Payments Panel — orchestrator only.
//
// Batch 4 of the refactor initiative split this file (was 884 lines)
// into concern-based sub-components under `./_payments/`. Each sub-file
// owns one card / row and imports its own deps, which keeps the
// surface area small for surgical fixes and makes the wiring here easy
// to read at a glance. Types and pure display helpers live alongside.

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  OpenCharge,
  PaymentTerms,
  PendingAmendment,
  PendingInitialCommitment,
  RecentPayment,
} from "./_payments/types";
import { dayOfMonthLocal } from "@/lib/local-date";
import { daysUntil, formatMoney } from "./_payments/helpers";
import { NextDueCard } from "./_payments/next-due-card";
import { VirtualNextDueCard } from "./_payments/virtual-next-due-card";
import { OpenChargeRow } from "./_payments/open-charge-row";
import { ReceiptRow } from "./_payments/receipt-row";
import { PaymentTermsCard } from "./_payments/payment-terms-card";
import { PendingCommitmentCard } from "./_payments/pending-commitment-card";
import { SummaryTile } from "./_payments/summary-tile";
import { AddOneTimeChargeDialog } from "@/app/(dashboard)/payments/add-one-time-charge-dialog";

interface Props {
  openCharges: OpenCharge[];
  recentPayments: RecentPayment[];
  canVoid: boolean;
  terms: PaymentTerms | null;
  isAdmin: boolean;
  residentUserId: string | null;
  residentName: string;
  pendingAmendment: PendingAmendment | null;
  // Initial commitment awaiting first signature (never activated).
  // Distinct from pendingAmendment — that targets ACTIVE commitments.
  pendingInitialCommitment: PendingInitialCommitment | null;
  // Passed through to the per-charge Record Payment dialog. Staff
  // (admin/manager with house access) can record a payment against
  // any open charge right from the row.
  residentId: string;
  houseId: string | null;
  canRecordPayment: boolean;
}

const PAGE_SIZE = 20;

export function ResidentPaymentsPanel({
  openCharges,
  recentPayments,
  terms,
  isAdmin,
  canVoid,
  residentUserId,
  residentName,
  pendingAmendment,
  pendingInitialCommitment,
  residentId,
  houseId,
  canRecordPayment,
}: Props) {
  const [page, setPage] = useState(0);

  const sortedCharges = [...openCharges].sort(
    (a, b) =>
      new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  );
  const nextCharge = sortedCharges[0] ?? null;

  const pastDueCount = sortedCharges.filter(
    (c) => daysUntil(c.due_date) < 0
  ).length;
  const totalOpen = sortedCharges.reduce(
    (sum, c) => sum + Math.max(0, c.amount - c.paid_amount),
    0
  );

  // Is there already an open/partial rent row? When YES the Next
  // Due hero or Other Open Charges list already surfaces it. When
  // NO — e.g. the only open charge is an admin fee, or the resident
  // just paid every open rent — we still want to show an Upcoming
  // Rent card so staff can see when the next rent cycle lands.
  const hasOpenRent = sortedCharges.some((c) => c.charge_type === "rent");

  // "Up to date" — no open charges at all. Used for the green pill
  // on the Payment Terms card. We show the expected next-cycle date
  // alongside it so staff can see at a glance when the next charge
  // will land, even though no DB row exists yet.
  const isUpToDate = sortedCharges.length === 0;
  const nextCycleDate = terms && isUpToDate ? computeNextCycleIso(terms) : null;

  const totalPages = Math.max(
    1,
    Math.ceil(recentPayments.length / PAGE_SIZE)
  );
  const clampedPage = Math.min(page, totalPages - 1);
  const start = clampedPage * PAGE_SIZE;
  const pageSlice = recentPayments.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Pending initial commitment — covers the case where intake
          review ran but the resident hasn't signed yet. Staff can
          edit the terms in place, resend the signature request, or
          mark it complete on the resident's behalf. */}
      {!terms && pendingInitialCommitment && residentUserId && (
        <PendingCommitmentCard
          pending={pendingInitialCommitment}
          isAdmin={isAdmin}
          residentUserId={residentUserId}
          residentName={residentName}
        />
      )}

      {/* Payment Terms — the current signed commitment drives rent
          schedule. Source of truth; edits require a new amendment. */}
      {terms && (
        <PaymentTermsCard
          terms={terms}
          isAdmin={isAdmin}
          residentId={residentId}
          residentUserId={residentUserId}
          pendingAmendment={pendingAmendment}
          isUpToDate={isUpToDate}
          nextCycleDate={nextCycleDate}
        />
      )}

      {/* Next Due hero card — real open charge sorted soonest-first.
          When the resident owes both rent and admin fee, rent sorts
          first thanks to the -1 day offset; when only admin fee is
          open the fee takes this slot. */}
      {nextCharge && (
        <NextDueCard
          charge={nextCharge}
          canRecordPayment={canRecordPayment && !!houseId}
          isAdmin={isAdmin}
          residentId={residentId}
          residentName={residentName}
          houseId={houseId ?? ""}
        />
      )}

      {/* Upcoming Rent card — always visible when terms exist and no
          open rent row is on the books yet. Covers two scenarios that
          used to silently drop off the page: (a) only an admin fee is
          outstanding so the Next Due hero shows the fee, not rent, and
          staff had no visibility of when the next rent lands, and
          (b) first rent cycle hasn't opened yet (existing-tenant
          activation with a future billing_anchor_date). Virtual — no
          DB row; gets replaced by a real NextDueCard on the due day. */}
      {terms && !hasOpenRent && (
        <VirtualNextDueCard
          terms={terms}
          pendingAmendment={pendingAmendment}
          canRecordPayment={canRecordPayment && !!houseId}
          residentId={residentId}
          residentName={residentName}
          houseId={houseId ?? ""}
        />
      )}

      {!nextCharge && !terms && (
        <Card>
          <CardContent className="py-6 text-center space-y-1">
            <p className="text-sm font-medium">No open charges</p>
            <p className="text-xs text-muted-foreground">
              All caught up — the next rent charge opens on the
              resident&apos;s monthly cycle.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary strip */}
      {sortedCharges.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile
            label="Open Charges"
            value={String(sortedCharges.length)}
            sub={formatMoney(totalOpen)}
            tone="default"
          />
          <SummaryTile
            label="Past Due"
            value={String(pastDueCount)}
            sub={pastDueCount > 0 ? "Needs attention" : "None"}
            tone={pastDueCount > 0 ? "danger" : "default"}
          />
        </div>
      )}

      {/* Other open charges — every additional charge beyond the Next
          Due hero gets its own row + Record Payment button so staff
          can pay any open charge directly (e.g. rent while admin fee
          is still outstanding). */}
      {sortedCharges.length > 1 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold px-0.5">
            Other Open Charges
          </h3>
          <div className="space-y-2">
            {sortedCharges.slice(1).map((c) => (
              <OpenChargeRow
                key={c.id}
                charge={c}
                canRecordPayment={canRecordPayment && !!houseId}
                isAdmin={isAdmin}
                residentId={residentId}
                residentName={residentName}
                houseId={houseId ?? ""}
              />
            ))}
          </div>
        </section>
      )}

      {/* Admin quick actions */}
      {isAdmin && houseId && (
        <div className="flex flex-wrap gap-2">
          <AddOneTimeChargeDialog
            residentId={residentId}
            residentName={residentName}
            houseId={houseId}
          />
        </div>
      )}

      {/* Recent receipts */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold px-0.5">
          Recent Receipts
        </h3>
        {recentPayments.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No payments recorded yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-2">
              {pageSlice.map((p) => (
                <ReceiptRow
                  key={p.id}
                  payment={p}
                  isAdmin={isAdmin}
                  canVoid={canVoid}
                  residentName={residentName}
                />
              ))}
            </div>
            {recentPayments.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Showing {start + 1}–
                  {Math.min(start + PAGE_SIZE, recentPayments.length)} of{" "}
                  {recentPayments.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={clampedPage === 0}
                    className="h-8 gap-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground px-1">
                    {clampedPage + 1} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={clampedPage >= totalPages - 1}
                    className="h-8 gap-1"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// Figure out the ISO date (YYYY-MM-DD) of the resident's next billing
// cycle, mirroring the logic the recurring-charge opener uses. Monthly:
// this month's due day (clamped for Feb), rolling to next month once
// today has passed it. Weekly: the next occurrence of the same weekday
// as the commitment start. Called only when there are no open charges,
// so the returned date is by definition in the future.
function computeNextCycleIso(terms: PaymentTerms): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (terms.payment_frequency === "weekly") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(terms.commitment_start_date);
    const startWeekday = m
      ? new Date(
          Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        ).getUTCDay()
      : today.getDay();
    const candidate = new Date(today);
    const diff = (startWeekday - today.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + (diff === 0 ? 7 : diff));
    return toIsoLocal(candidate);
  }

  const dayOfMonth = dayOfMonthLocal(terms.commitment_start_date);
  const candidate = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayThis = new Date(
    candidate.getFullYear(),
    candidate.getMonth() + 1,
    0
  ).getDate();
  candidate.setDate(Math.min(dayOfMonth, lastDayThis));
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
  return toIsoLocal(candidate);
}

// Local YYYY-MM-DD formatter — bypasses toISOString()'s UTC shift so
// a Pacific-evening "today" doesn't land on tomorrow's calendar day.
function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
