"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { DownloadReceiptButton } from "@/app/(dashboard)/payments/download-receipt-button";

// --- Types ---
// Kept local so the parent page can pass the raw Supabase row shape
// without extra mapping. Fields line up with payment_charges /
// payments columns.

interface OpenCharge {
  id: string;
  charge_type: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
}

interface RecentPayment {
  id: string;
  amount: number;
  payment_type: string | null;
  payment_method: string | null;
  paid_at: string;
  status: string;
  receipt_number: string | null;
  receipt_storage_path: string | null;
  note: string | null;
}

interface Props {
  openCharges: OpenCharge[];
  recentPayments: RecentPayment[];
  canVoid: boolean;
}

const PAGE_SIZE = 20;

// --- Helpers ---
function formatMoney(amount: number): string {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function chargeTypeLabel(type: string): string {
  switch (type) {
    case "rent":
      return "Rent";
    case "admin_fee":
      return "Admin Fee";
    case "deposit":
      return "Deposit";
    case "misc":
      return "Misc";
    default:
      return type.replace(/_/g, " ");
  }
}

function paymentLabel(type: string | null, method: string | null): string {
  const parts: string[] = [];
  if (type) parts.push(chargeTypeLabel(type));
  if (method) parts.push(method);
  return parts.join(" · ") || "Payment";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const ms = due.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// --- Component ---
export function ResidentPaymentsPanel({
  openCharges,
  recentPayments,
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
      {/* Next Due hero card */}
      {nextCharge ? (
        <NextDueCard charge={nextCharge} />
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

      {/* Open charges list */}
      {sortedCharges.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold px-0.5">
            Open Charges ({sortedCharges.length})
          </h3>
          <div className="space-y-2">
            {sortedCharges.map((c) => (
              <OpenChargeRow key={c.id} charge={c} />
            ))}
          </div>
        </section>
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
                <ReceiptRow key={p.id} payment={p} />
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

// --- Sub-components ---

function NextDueCard({ charge }: { charge: OpenCharge }) {
  const days = daysUntil(charge.due_date);
  const isPastDue = days < 0;
  const isDueSoon = days >= 0 && days <= 3;
  const remaining = Math.max(0, charge.amount - charge.paid_amount);
  const isPartial = charge.paid_amount > 0;

  return (
    <Card
      className={
        isPastDue
          ? "border-destructive/60 bg-destructive/5"
          : isDueSoon
            ? "border-amber-500/50 bg-amber-50/60"
            : ""
      }
    >
      <CardContent className="py-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Next Due
            </p>
            <p className="text-2xl font-bold flex items-center gap-1.5">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              {formatMoney(remaining)}
            </p>
            <p className="text-sm text-muted-foreground">
              {chargeTypeLabel(charge.charge_type)}
              {isPartial && ` · ${formatMoney(charge.paid_amount)} paid`}
            </p>
          </div>
          <Badge
            variant={
              isPastDue ? "destructive" : isDueSoon ? "secondary" : "outline"
            }
            className="whitespace-nowrap"
          >
            {isPastDue
              ? `${Math.abs(days)}d past due`
              : days === 0
                ? "Due today"
                : days === 1
                  ? "Due tomorrow"
                  : `Due in ${days}d`}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {formatDate(charge.due_date)}
          {isPastDue && (
            <span className="flex items-center gap-1 text-destructive font-medium">
              <AlertCircle className="h-3.5 w-3.5" />
              Past Due
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OpenChargeRow({ charge }: { charge: OpenCharge }) {
  const days = daysUntil(charge.due_date);
  const isPastDue = days < 0;
  const remaining = Math.max(0, charge.amount - charge.paid_amount);
  const isPartial = charge.paid_amount > 0;

  return (
    <Card className={isPastDue ? "border-destructive/50" : ""}>
      <CardContent className="py-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">
              {chargeTypeLabel(charge.charge_type)}
            </p>
            {isPartial && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                Partial
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Due {formatDate(charge.due_date)}
            {isPastDue && ` · ${Math.abs(days)}d late`}
            {isPartial &&
              ` · ${formatMoney(charge.paid_amount)} of ${formatMoney(charge.amount)} paid`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p
            className={`text-sm font-semibold ${isPastDue ? "text-destructive" : ""}`}
          >
            {formatMoney(remaining)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReceiptRow({ payment }: { payment: RecentPayment }) {
  const isVoid =
    payment.status === "void" || payment.status === "refunded";
  return (
    <Card className={isVoid ? "opacity-60" : ""}>
      <CardContent className="py-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">
              {formatMoney(payment.amount)}
            </p>
            {payment.receipt_number && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {payment.receipt_number}
              </span>
            )}
            {isVoid && (
              <Badge variant="destructive" className="text-[10px] h-4 px-1.5 capitalize">
                {payment.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {paymentLabel(payment.payment_type, payment.payment_method)}
            {" · "}
            {formatDate(payment.paid_at)}
          </p>
        </div>
        <div className="shrink-0">
          <DownloadReceiptButton
            storagePath={payment.receipt_storage_path}
            receiptNumber={payment.receipt_number}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "default" | "danger";
}) {
  return (
    <Card
      className={tone === "danger" ? "border-destructive/50 bg-destructive/5" : ""}
    >
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-xl font-bold ${tone === "danger" ? "text-destructive" : ""}`}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
