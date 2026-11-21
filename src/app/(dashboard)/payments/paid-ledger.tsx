"use client";

// Paid tab — paginated ledger of recorded payments with a date-range
// quick filter + resident search. Previously the only filter was
// pagination, which made "how much did we collect from Carlos in
// March?" impossible to answer without scrolling. Range defaults to
// "This month" on mount because that's the answer staff want 90% of
// the time when they open the Paid tab.

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { VoidPaymentDialog } from "./void-payment-dialog";
import { DeletePaymentDialog } from "./delete-payment-dialog";
import { DownloadReceiptButton } from "./download-receipt-button";
import { formatInAppTz } from "@/lib/timezone";

interface PaymentRow {
  id: string;
  amount: number;
  payment_type: string | null;
  payment_method: string | null;
  paid_at: string;
  status: string;
  note: string | null;
  receipt_number: string | null;
  receipt_storage_path: string | null;
  resident_name: string;
  house_name: string;
  recorder_name: string;
}

interface Props {
  payments: PaymentRow[];
  userRole: string;
  todayIso: string;
  monthStartIso: string;
  monthEndIso: string;
}

type RangeKey = "this_month" | "last_month" | "last_90" | "all";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function typeBadgeVariant(
  type: string | null
): "default" | "secondary" | "outline" {
  if (type === "rent") return "default";
  if (type === "deposit") return "secondary";
  return "outline";
}

function statusBadgeVariant(
  status: string
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "completed") return "default";
  if (status === "pending") return "secondary";
  if (status === "void") return "destructive";
  return "outline";
}

function formatMethod(m: string | null): string {
  if (!m) return "";
  return m.replace(/_/g, " ");
}

export function PaidLedger({
  payments,
  userRole,
  todayIso,
  monthStartIso,
  monthEndIso,
}: Props) {
  const [range, setRange] = useState<RangeKey>("this_month");
  const [search, setSearch] = useState("");

  // Compute the lower bound for each range. Upper bound is always
  // today (we never show future-dated payments). Ranges are compared
  // against paid_at's date portion, already in Eastern since
  // monthStartIso/monthEndIso came in pre-converted.
  const lowerIso = useMemo(() => {
    if (range === "this_month") return monthStartIso;
    if (range === "last_month") {
      // One day before monthStart = last day of previous month, then
      // back up to the 1st.
      const [y, m] = monthStartIso.split("-").map(Number);
      const prevMonth = m === 1 ? 12 : m - 1;
      const prevYear = m === 1 ? y - 1 : y;
      return `${String(prevYear).padStart(4, "0")}-${String(prevMonth).padStart(
        2,
        "0"
      )}-01`;
    }
    if (range === "last_90") {
      const [y, m, d] = todayIso.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 90);
      const ly = dt.getUTCFullYear();
      const lm = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const ld = String(dt.getUTCDate()).padStart(2, "0");
      return `${ly}-${lm}-${ld}`;
    }
    return "0000-00-00";
  }, [range, todayIso, monthStartIso]);

  const upperIso = useMemo(() => {
    if (range === "last_month") {
      const [y, m] = monthStartIso.split("-").map(Number);
      // Last day of previous month = day 0 of current month.
      const dt = new Date(Date.UTC(y, m - 1, 0));
      const ly = dt.getUTCFullYear();
      const lm = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const ld = String(dt.getUTCDate()).padStart(2, "0");
      return `${ly}-${lm}-${ld}`;
    }
    if (range === "all") return "9999-99-99";
    if (range === "this_month") return monthEndIso;
    return todayIso;
  }, [range, todayIso, monthStartIso, monthEndIso]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const paidIso = p.paid_at.slice(0, 10);
      if (paidIso < lowerIso) return false;
      if (paidIso > upperIso) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.resident_name.toLowerCase().includes(q) ||
        p.house_name.toLowerCase().includes(q) ||
        (p.receipt_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [payments, lowerIso, upperIso, search]);

  const totalInRange = filtered
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + Number(p.amount), 0);

  const rangeLabel: Record<RangeKey, string> = {
    this_month: "This month",
    last_month: "Last month",
    last_90: "Last 90 days",
    all: "All time",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border bg-background p-0.5">
          {(Object.keys(rangeLabel) as RangeKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setRange(k)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                range === k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {rangeLabel[k]}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search resident, house, receipt"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="ml-auto shrink-0 text-xs text-muted-foreground">
          {filtered.length} payment{filtered.length === 1 ? "" : "s"} ·{" "}
          <span className="font-medium">{formatCurrency(totalInRange)}</span>
          <span className="ml-1">collected</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No payments in this range.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Card key={p.id}>
              <CardContent className="py-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    {p.payment_type && (
                      <Badge
                        variant={typeBadgeVariant(p.payment_type)}
                        className="capitalize"
                      >
                        {p.payment_type}
                      </Badge>
                    )}
                    <span className="font-semibold">
                      {formatCurrency(Number(p.amount))}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {p.resident_name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge
                      variant={statusBadgeVariant(p.status)}
                      className="capitalize"
                    >
                      {p.status}
                    </Badge>
                    {p.receipt_storage_path && (
                      <DownloadReceiptButton
                        storagePath={p.receipt_storage_path}
                        receiptNumber={p.receipt_number ?? null}
                      />
                    )}
                    {userRole === "admin" &&
                      p.status !== "void" &&
                      p.status !== "refunded" && (
                        <VoidPaymentDialog
                          paymentId={p.id}
                          amount={Number(p.amount)}
                          residentName={p.resident_name}
                        />
                      )}
                    {userRole === "admin" && (
                      <DeletePaymentDialog
                        paymentId={p.id}
                        amount={Number(p.amount)}
                        residentName={p.resident_name}
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {formatInAppTz(p.paid_at, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {p.house_name && <span>· {p.house_name}</span>}
                  {p.payment_method && (
                    <span className="capitalize">
                      · {formatMethod(p.payment_method)}
                    </span>
                  )}
                  {p.receipt_number && <span>· {p.receipt_number}</span>}
                  {p.recorder_name && <span>· by {p.recorder_name}</span>}
                </div>
                {p.note && (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    {p.note}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
