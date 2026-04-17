"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Calendar,
  DollarSign,
  FileText,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { DownloadReceiptButton } from "./download-receipt-button";
import { getDocumentUrl } from "@/app/(intake)/actions";
import { daysUntilLocal, dayOfMonthLocal } from "@/lib/local-date";

// Resident-facing payments view. Single component because the page
// already does all the data fetching; this just handles presentation
// + tab state.

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

interface PaymentTerms {
  rent_amount: number;
  admin_fee: number | null;
  commitment_start_date: string;
  pdf_storage_path: string | null;
}

interface Props {
  openCharges: OpenCharge[];
  payments: RecentPayment[];
  terms: PaymentTerms | null;
}

const PAGE_SIZE = 20;

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function chargeLabel(t: string): string {
  switch (t) {
    case "rent":
      return "Rent";
    case "admin_fee":
      return "Admin Fee";
    case "deposit":
      return "Deposit";
    case "misc":
      return "Misc";
    default:
      return t.replace(/_/g, " ");
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function daysUntil(iso: string): number {
  // Parsing the date-only string as local avoids the US-timezone
  // off-by-one where `new Date("2026-04-15")` becomes April 14.
  return daysUntilLocal(iso);
}

export function ResidentPaymentsView({ openCharges, payments, terms }: Props) {
  const [pastPage, setPastPage] = useState(0);

  const sortedCharges = [...openCharges].sort((a, b) =>
    a.due_date.localeCompare(b.due_date)
  );
  const totalOpen = sortedCharges.reduce(
    (s, c) => s + Math.max(0, c.amount - c.paid_amount),
    0
  );
  const pastDueCount = sortedCharges.filter(
    (c) => daysUntil(c.due_date) < 0
  ).length;
  const next = sortedCharges[0] ?? null;

  const paidYtd = payments
    .filter((p) => {
      if (p.status !== "completed") return false;
      return new Date(p.paid_at).getFullYear() === new Date().getFullYear();
    })
    .reduce((s, p) => s + p.amount, 0);

  const totalPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE));
  const clamped = Math.min(pastPage, totalPages - 1);
  const start = clamped * PAGE_SIZE;
  const pageSlice = payments.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Payment Terms */}
      {terms && <PaymentTermsCard terms={terms} />}

      {/* Account summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryTile label="Balance Due" value={money(totalOpen)} />
        <SummaryTile
          label="Past Due"
          value={String(pastDueCount)}
          tone={pastDueCount > 0 ? "danger" : "default"}
        />
        <SummaryTile label="Paid YTD" value={money(paidYtd)} />
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming
            {sortedCharges.length > 0 && (
              <Badge
                variant={pastDueCount > 0 ? "destructive" : "secondary"}
                className="ml-1.5 h-5 px-1.5 text-xs"
              >
                {sortedCharges.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="past">Past Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4 space-y-4">
          {next ? (
            <NextDueCard charge={next} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center space-y-1">
                <DollarSign className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">You&apos;re all caught up</p>
                <p className="text-xs text-muted-foreground">
                  Your next rent charge will open on your monthly cycle.
                </p>
              </CardContent>
            </Card>
          )}
          {sortedCharges.length > 1 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold px-0.5">Other Open Charges</h3>
              <div className="space-y-2">
                {sortedCharges.slice(1).map((c) => (
                  <OpenChargeRow key={c.id} charge={c} />
                ))}
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-4 space-y-2">
          {payments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
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
              {payments.length > PAGE_SIZE && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {start + 1}–
                    {Math.min(start + PAGE_SIZE, payments.length)} of{" "}
                    {payments.length}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPastPage((n) => Math.max(0, n - 1))}
                      disabled={clamped === 0}
                      className="h-8 gap-1"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground px-1">
                      {clamped + 1} / {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPastPage((n) => Math.min(totalPages - 1, n + 1))
                      }
                      disabled={clamped >= totalPages - 1}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaymentTermsCard({ terms }: { terms: PaymentTerms }) {
  const [loading, setLoading] = useState(false);
  const dueDay = dayOfMonthLocal(terms.commitment_start_date);

  async function open() {
    if (!terms.pdf_storage_path) return;
    setLoading(true);
    try {
      const res = await getDocumentUrl(terms.pdf_storage_path);
      if (res.url) window.open(res.url, "_blank");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Payment Terms</p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            From Commitment
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Monthly Rent</p>
            <p className="font-semibold">{money(terms.rent_amount)}</p>
          </div>
          {terms.admin_fee !== null && terms.admin_fee > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Admin Fee</p>
              <p className="font-semibold">{money(terms.admin_fee)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Due Day</p>
            <p className="font-semibold">{ordinal(dueDay)} of each month</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Effective</p>
            <p className="font-semibold">
              {new Date(terms.commitment_start_date).toLocaleDateString()}
            </p>
          </div>
        </div>
        {terms.pdf_storage_path && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={loading}
            onClick={open}
          >
            <FileText className="h-3.5 w-3.5" />
            View Signed Commitment
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function NextDueCard({ charge }: { charge: OpenCharge }) {
  const days = daysUntil(charge.due_date);
  const pastDue = days < 0;
  const soon = days >= 0 && days <= 3;
  const remaining = Math.max(0, charge.amount - charge.paid_amount);
  const isPartial = charge.paid_amount > 0;

  return (
    <Card
      className={
        pastDue
          ? "border-destructive/60 bg-destructive/5"
          : soon
            ? "border-amber-500/50 bg-amber-50/60"
            : "border-primary/30"
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
              {money(remaining)}
            </p>
            <p className="text-sm text-muted-foreground">
              {chargeLabel(charge.charge_type)}
              {isPartial && ` · ${money(charge.paid_amount)} paid`}
            </p>
          </div>
          <Badge
            variant={
              pastDue ? "destructive" : soon ? "secondary" : "outline"
            }
            className="whitespace-nowrap"
          >
            {pastDue
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
          {new Date(charge.due_date).toLocaleDateString()}
          {pastDue && (
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
  const pastDue = days < 0;
  const remaining = Math.max(0, charge.amount - charge.paid_amount);
  const isPartial = charge.paid_amount > 0;

  return (
    <Card className={pastDue ? "border-destructive/50" : ""}>
      <CardContent className="py-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">
              {chargeLabel(charge.charge_type)}
            </p>
            {isPartial && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                Partial
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Due {new Date(charge.due_date).toLocaleDateString()}
            {pastDue && ` · ${Math.abs(days)}d late`}
          </p>
        </div>
        <p
          className={`text-sm font-semibold shrink-0 ${pastDue ? "text-destructive" : ""}`}
        >
          {money(remaining)}
        </p>
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
            <p className="text-sm font-medium">{money(payment.amount)}</p>
            {payment.receipt_number && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {payment.receipt_number}
              </span>
            )}
            {isVoid && (
              <Badge
                variant="destructive"
                className="text-[10px] h-4 px-1.5 capitalize"
              >
                {payment.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {[payment.payment_type, payment.payment_method]
              .filter(Boolean)
              .join(" · ")}
            {" · "}
            {new Date(payment.paid_at).toLocaleDateString()}
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
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <Card
      className={
        tone === "danger" ? "border-destructive/50 bg-destructive/5" : ""
      }
    >
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-xl font-bold ${tone === "danger" ? "text-destructive" : ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
