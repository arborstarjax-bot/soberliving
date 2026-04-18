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
import { daysUntil, formatMoney } from "./_payments/helpers";
import { NextDueCard } from "./_payments/next-due-card";
import { VirtualNextDueCard } from "./_payments/virtual-next-due-card";
import { ReceiptRow } from "./_payments/receipt-row";
import { PaymentTermsCard } from "./_payments/payment-terms-card";
import { PendingCommitmentCard } from "./_payments/pending-commitment-card";
import { SummaryTile } from "./_payments/summary-tile";

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
          residentUserId={residentUserId}
          residentName={residentName}
          pendingAmendment={pendingAmendment}
        />
      )}

      {/* Next Due hero card */}
      {nextCharge ? (
        <NextDueCard
          charge={nextCharge}
          canRecordPayment={canRecordPayment && !!houseId}
          residentId={residentId}
          residentName={residentName}
          houseId={houseId ?? ""}
        />
      ) : terms ? (
        <VirtualNextDueCard
          terms={terms}
          canRecordPayment={canRecordPayment && !!houseId}
          residentId={residentId}
          residentName={residentName}
          houseId={houseId ?? ""}
        />
      ) : (
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

      {/* Open charges list removed — Next Due hero above + summary
          tiles cover everything actionable. Record Payment is wired
          into the hero card itself. */}

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
