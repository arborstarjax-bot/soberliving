"use client";

// "By Resident" tab on the staff /payments hub. One row per active
// resident with a snapshot of their balance, past-due, next due, and
// last paid. Tapping the row opens a Sheet that has every per-charge
// payment action (record / record partial / download receipt) and a
// quick link to the resident's full profile for amendment + void.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, ExternalLink, Search } from "lucide-react";
import { RecordChargePaymentDialog } from "./record-charge-payment-dialog";
import { DownloadReceiptButton } from "./download-receipt-button";
import { todayLocalIso, daysUntilLocal } from "@/lib/local-date";

interface OpenCharge {
  id: string;
  resident_id: string;
  house_id: string;
  charge_type: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
}

interface RecentPayment {
  id: string;
  resident_id: string;
  amount: number;
  paid_at: string;
  status: string;
  receipt_number: string | null;
  receipt_storage_path: string | null;
}

interface ResidentRow {
  id: string;
  full_name: string;
  house_id: string;
  house_name: string;
}

interface Props {
  residents: ResidentRow[];
  openCharges: OpenCharge[];
  recentPayments: RecentPayment[];
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function chargeTypeLabel(t: string): string {
  if (t === "rent") return "Rent";
  if (t === "admin_fee") return "Admin Fee";
  if (t === "deposit") return "Deposit";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PaymentsByResident({
  residents,
  openCharges,
  recentPayments,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedResidentId, setSelectedResidentId] = useState<string | null>(
    null
  );

  const today = todayLocalIso();

  const summaries = useMemo(() => {
    return residents.map((r) => {
      const charges = openCharges
        .filter((c) => c.resident_id === r.id)
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      const balance = charges.reduce(
        (s, c) => s + Math.max(0, c.amount - c.paid_amount),
        0
      );
      const pastDueCount = charges.filter((c) => c.due_date < today).length;
      const pastDueAmount = charges
        .filter((c) => c.due_date < today)
        .reduce((s, c) => s + Math.max(0, c.amount - c.paid_amount), 0);
      const nextDue = charges[0] ?? null;
      const lastPayment =
        recentPayments
          .filter((p) => p.resident_id === r.id && p.status === "completed")
          .sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0] ?? null;
      return {
        resident: r,
        charges,
        balance,
        pastDueCount,
        pastDueAmount,
        nextDue,
        lastPayment,
      };
    });
  }, [residents, openCharges, recentPayments, today]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q
      ? summaries.filter(
          (s) =>
            s.resident.full_name.toLowerCase().includes(q) ||
            s.resident.house_name.toLowerCase().includes(q)
        )
      : summaries;
    return [...visible].sort((a, b) => {
      if (a.pastDueAmount !== b.pastDueAmount) {
        return b.pastDueAmount - a.pastDueAmount;
      }
      if (a.balance !== b.balance) return b.balance - a.balance;
      return a.resident.full_name.localeCompare(b.resident.full_name);
    });
  }, [summaries, query]);

  const selected = useMemo(() => {
    if (!selectedResidentId) return null;
    return summaries.find((s) => s.resident.id === selectedResidentId) ?? null;
  }, [summaries, selectedResidentId]);

  const selectedReceipts = useMemo(() => {
    if (!selectedResidentId) return [];
    return recentPayments
      .filter((p) => p.resident_id === selectedResidentId)
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
      .slice(0, 10);
  }, [recentPayments, selectedResidentId]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search residents or houses…"
          className="pl-8"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No residents match.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const days = s.nextDue ? daysUntilLocal(s.nextDue.due_date) : null;
            const pastDueRow = s.pastDueAmount > 0;
            return (
              <Card
                key={s.resident.id}
                className={pastDueRow ? "border-destructive/50" : ""}
              >
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">
                          {s.resident.full_name}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {s.resident.house_name}
                        </span>
                        {pastDueRow && (
                          <Badge variant="destructive" className="h-5 px-1.5 text-[10px] gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {s.pastDueCount} past due
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.nextDue ? (
                          <>
                            Next:{" "}
                            {chargeTypeLabel(s.nextDue.charge_type)} ·{" "}
                            {formatMoney(
                              Math.max(
                                0,
                                s.nextDue.amount - s.nextDue.paid_amount
                              )
                            )}{" "}
                            · {formatDate(s.nextDue.due_date)}
                            {days !== null && days < 0 && (
                              <> · <span className="text-destructive font-medium">{Math.abs(days)}d late</span></>
                            )}
                          </>
                        ) : (
                          "No open charges"
                        )}
                      </p>
                      {s.lastPayment && (
                        <p className="text-xs text-muted-foreground">
                          Last paid: {formatMoney(s.lastPayment.amount)} ·{" "}
                          {formatDate(s.lastPayment.paid_at.slice(0, 10))}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p
                        className={`text-sm font-semibold ${pastDueRow ? "text-destructive" : ""}`}
                      >
                        {formatMoney(s.balance)}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Open
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => setSelectedResidentId(s.resident.id)}
                    >
                      Manage
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelectedResidentId(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 flex-wrap">
                  {selected.resident.full_name}
                  <Link
                    href={`/residents/${selected.resident.id}`}
                    className="text-xs text-muted-foreground font-normal inline-flex items-center gap-1 hover:underline"
                  >
                    Full profile <ExternalLink className="h-3 w-3" />
                  </Link>
                </SheetTitle>
                <SheetDescription>
                  {selected.resident.house_name} · Balance{" "}
                  {formatMoney(selected.balance)}
                  {selected.pastDueAmount > 0 && (
                    <>
                      {" "}·{" "}
                      <span className="text-destructive font-medium">
                        {formatMoney(selected.pastDueAmount)} past due
                      </span>
                    </>
                  )}
                </SheetDescription>
              </SheetHeader>

              <div className="px-4 pb-4 space-y-5">
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Open Charges</h3>
                  {selected.charges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No open charges.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selected.charges.map((c) => {
                        const remaining = Math.max(
                          0,
                          c.amount - c.paid_amount
                        );
                        const d = daysUntilLocal(c.due_date);
                        const isPast = d < 0;
                        const isPartial = c.paid_amount > 0;
                        return (
                          <div
                            key={c.id}
                            className={`rounded-md border p-3 space-y-2 ${
                              isPast ? "border-destructive/50" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">
                                  {chargeTypeLabel(c.charge_type)}{" "}
                                  {isPartial && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] h-4 px-1.5 ml-1"
                                    >
                                      Partial
                                    </Badge>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Due {formatDate(c.due_date)}
                                  {isPast && ` · ${Math.abs(d)}d late`}
                                  {isPartial &&
                                    ` · ${formatMoney(c.paid_amount)} of ${formatMoney(c.amount)} paid`}
                                </p>
                              </div>
                              <p
                                className={`text-sm font-semibold shrink-0 ${
                                  isPast ? "text-destructive" : ""
                                }`}
                              >
                                {formatMoney(remaining)}
                              </p>
                            </div>
                            <div className="flex justify-end">
                              <RecordChargePaymentDialog
                                residentId={selected.resident.id}
                                residentName={selected.resident.full_name}
                                houseId={selected.resident.house_id}
                                charge={c}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Recent Receipts</h3>
                  {selectedReceipts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No receipts yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedReceipts.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between rounded-md border p-3 gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {formatMoney(r.amount)}
                              {r.status !== "completed" && (
                                <span className="text-muted-foreground ml-1">
                                  · {r.status}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(r.paid_at.slice(0, 10))}
                              {r.receipt_number && ` · ${r.receipt_number}`}
                            </p>
                          </div>
                          {r.receipt_storage_path && (
                            <DownloadReceiptButton
                              storagePath={r.receipt_storage_path}
                              receiptNumber={r.receipt_number}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
