"use client";

// Outstanding tab, grouped by resident. Previous flat list mixed
// everyone together — scanning for a specific resident or seeing
// "Carlos owes $1,200 split across 3 charges" was painful. Now each
// resident is a collapsible group with their total balance surfaced
// up front; expand to see the individual charges and record payment
// inline. Defaults to all rows collapsed so the page shows one row
// per resident at a glance.

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { RecordChargePaymentDialog } from "./record-charge-payment-dialog";
import { formatDateOnly } from "@/lib/timezone";

interface Charge {
  id: string;
  resident_id: string;
  resident_name: string;
  house_id: string;
  house_name: string;
  charge_type: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
}

interface Props {
  charges: Charge[];
  todayIso: string;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function chargeTypeLabel(t: string): string {
  switch (t) {
    case "rent":
      return "Rent";
    case "admin_fee":
      return "Admin";
    case "deposit":
      return "Deposit";
    default:
      return t.replace(/_/g, " ");
  }
}

export function OutstandingByResident({ charges, todayIso }: Props) {
  const [search, setSearch] = useState("");
  const [pastDueOnly, setPastDueOnly] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Group charges by resident. Keep original ordering (oldest due
  // first) within a group so the most-pressing charge is the first
  // thing you see when you expand.
  const grouped = useMemo(() => {
    const filtered = charges.filter((c) => {
      if (pastDueOnly && c.due_date >= todayIso) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.resident_name.toLowerCase().includes(q) ||
        c.house_name.toLowerCase().includes(q)
      );
    });
    const byResident = new Map<string, Charge[]>();
    for (const c of filtered) {
      if (!byResident.has(c.resident_id)) byResident.set(c.resident_id, []);
      byResident.get(c.resident_id)!.push(c);
    }
    // Sort residents by total past-due first (worst at top), then by
    // total balance descending. Makes the biggest problems most
    // visible.
    return Array.from(byResident.entries())
      .map(([residentId, list]) => {
        const name = list[0].resident_name;
        const house = list[0].house_name;
        const balance = list.reduce(
          (s, c) => s + (Number(c.amount) - Number(c.paid_amount)),
          0
        );
        const pastDueCount = list.filter(
          (c) => c.due_date < todayIso
        ).length;
        return { residentId, name, house, balance, pastDueCount, charges: list };
      })
      .sort((a, b) => {
        if (a.pastDueCount !== b.pastDueCount)
          return b.pastDueCount - a.pastDueCount;
        return b.balance - a.balance;
      });
  }, [charges, search, pastDueOnly, todayIso]);

  const totalBalance = grouped.reduce((s, g) => s + g.balance, 0);
  const totalPastDue = grouped.reduce((s, g) => s + g.pastDueCount, 0);

  if (charges.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            Nothing outstanding — everyone&apos;s caught up.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search resident or house"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant={pastDueOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setPastDueOnly((v) => !v)}
          className="shrink-0"
        >
          {pastDueOnly ? "Past due only ✓" : "Past due only"}
        </Button>
        <div className="ml-auto shrink-0 text-xs text-muted-foreground">
          {grouped.length} resident{grouped.length === 1 ? "" : "s"} ·{" "}
          <span className="font-medium">{formatCurrency(totalBalance)}</span>
          {totalPastDue > 0 && (
            <>
              {" · "}
              <span className="text-destructive">
                {totalPastDue} past-due charge{totalPastDue === 1 ? "" : "s"}
              </span>
            </>
          )}
        </div>
      </div>

      {grouped.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No results.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {grouped.map((g) => {
                const isOpen = expanded[g.residentId] ?? false;
                return (
                  <div key={g.residentId}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((m) => ({
                          ...m,
                          [g.residentId]: !isOpen,
                        }))
                      }
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{g.name}</span>
                          {g.pastDueCount > 0 && (
                            <Badge
                              variant="destructive"
                              className="h-5 px-1.5 text-[10px]"
                            >
                              {g.pastDueCount} past due
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          {g.house} · {g.charges.length} open charge
                          {g.charges.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div
                        className={`shrink-0 text-base font-semibold ${
                          g.pastDueCount > 0 ? "text-destructive" : ""
                        }`}
                      >
                        {formatCurrency(g.balance)}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="bg-muted/20 px-4 pb-3 pt-0">
                        <div className="divide-y rounded-md border bg-background">
                          {g.charges.map((c) => {
                            const balance =
                              Number(c.amount) - Number(c.paid_amount);
                            const pastDue = c.due_date < todayIso;
                            return (
                              <div
                                key={c.id}
                                className="flex items-center justify-between gap-3 px-3 py-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant={
                                        pastDue ? "destructive" : "outline"
                                      }
                                      className="text-[10px]"
                                    >
                                      {chargeTypeLabel(c.charge_type)}
                                    </Badge>
                                    <span className="text-sm">
                                      Due {formatDateOnly(c.due_date)}
                                    </span>
                                  </div>
                                  {Number(c.paid_amount) > 0 && (
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {formatCurrency(Number(c.paid_amount))} of{" "}
                                      {formatCurrency(Number(c.amount))} paid
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className={`text-sm font-semibold ${
                                      pastDue ? "text-destructive" : ""
                                    }`}
                                  >
                                    {formatCurrency(balance)}
                                  </span>
                                  <RecordChargePaymentDialog
                                    residentId={c.resident_id}
                                    residentName={g.name}
                                    houseId={c.house_id}
                                    charge={{
                                      id: c.id,
                                      charge_type: c.charge_type,
                                      amount: Number(c.amount),
                                      paid_amount: Number(c.paid_amount),
                                      due_date: c.due_date,
                                      period_start: c.period_start,
                                      period_end: c.period_end,
                                    }}
                                    variant={pastDue ? "default" : "outline"}
                                    size="sm"
                                    label="Record"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
