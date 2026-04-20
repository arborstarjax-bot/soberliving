"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CheckCircle2, ClipboardList, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { dayOfMonthLocal } from "@/lib/local-date";
import { getDocumentUrl } from "@/app/(intake)/actions";
import { cn } from "@/lib/utils";
import { EditTermsDialog } from "@/app/(dashboard)/payments/edit-terms-dialog";
import { cancelPendingAmendment } from "@/app/(dashboard)/payments/actions";
import type { PaymentTerms, PendingAmendment } from "./types";
import { formatDate, formatMoney, ordinal } from "./helpers";

export function PaymentTermsCard({
  terms,
  isAdmin,
  residentUserId,
  residentName,
  pendingAmendment,
  isUpToDate,
  nextCycleDate,
}: {
  terms: PaymentTerms;
  isAdmin: boolean;
  residentUserId: string | null;
  residentName: string;
  pendingAmendment: PendingAmendment | null;
  // True when the resident has zero open charges — their balance
  // is clear through the next billing cycle. Used by the "Up to
  // date" badge; the badge is hidden when an amendment is pending
  // because the tracking picture changes as soon as it's signed.
  isUpToDate: boolean;
  // ISO date (YYYY-MM-DD) of the next billing cycle. Rendered
  // inside the up-to-date pill so staff can see at a glance when
  // the next charge will open.
  nextCycleDate: string | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();
  const [cancelPending, startCancel] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Pull the day-of-month directly from the ISO string — going
  // through `new Date(iso).getDate()` drifts a day in US timezones
  // because date-only strings parse as UTC midnight.
  const dueDay = dayOfMonthLocal(terms.commitment_start_date);
  const isWeekly = terms.payment_frequency === "weekly";
  // Weekday label for the card's "Due Day" row when the resident
  // is on weekly cadence. Parse the date-only string as UTC to avoid
  // the same TZ drift `dayOfMonthLocal` guards against.
  const weeklyWeekday = (() => {
    const iso = terms.commitment_start_date;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return "";
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "long",
    });
  })();

  // Legacy fallback for the rare case we didn't manage to pre-sign
  // the URL server-side (e.g. storage transient error). Still uses
  // the synchronous-window trick so iOS Safari keeps the user-gesture
  // context when it falls through to the server action.
  async function openCommitment() {
    if (!terms.pdf_storage_path) return;
    // Open a blank tab immediately so iOS keeps the user-gesture
    // context; redirect it once the signed URL resolves.
    const w = typeof window !== "undefined" ? window.open("", "_blank") : null;
    setDownloading(true);
    try {
      const res = await getDocumentUrl(terms.pdf_storage_path);
      if (res.url) {
        if (w) w.location.href = res.url;
        else window.location.href = res.url;
      } else if (w) {
        w.close();
      }
    } finally {
      setDownloading(false);
    }
  }

  const effectiveDefault = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(dueDay);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

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
        {isUpToDate && !pendingAmendment && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-700" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-green-900">
                Up to date
              </p>
              <p className="text-[11px] text-green-800">
                {nextCycleDate
                  ? `No open charges. Next ${isWeekly ? "weekly" : "monthly"} rent cycle opens ${formatDate(nextCycleDate)}.`
                  : `No open charges. Balance is clear through the next ${isWeekly ? "weekly" : "monthly"} cycle.`}
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">
              {isWeekly ? "Weekly Rent" : "Monthly Rent"}
            </p>
            <p className="font-semibold">{formatMoney(terms.rent_amount)}</p>
          </div>
          {terms.admin_fee !== null && terms.admin_fee > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Admin Fee</p>
              <p className="font-semibold">{formatMoney(terms.admin_fee)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Due Day</p>
            <p className="font-semibold">
              {isWeekly
                ? weeklyWeekday
                  ? `Every ${weeklyWeekday}`
                  : "Weekly"
                : `${ordinal(dueDay)} of each month`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Effective</p>
            <p className="font-semibold">
              {formatDate(terms.commitment_start_date)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {terms.pdf_storage_path &&
            (terms.pdf_signed_url ? (
              // Native <a href> tap — required for iOS Safari, which
              // blocks window.open called after an async server
              // action has resolved.
              <a
                href={terms.pdf_signed_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-8 gap-1.5"
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                View Signed Commitment
              </a>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={downloading}
                onClick={openCommitment}
              >
                <FileText className="h-3.5 w-3.5" />
                View Signed Commitment
              </Button>
            ))}
          {isAdmin && residentUserId && !pendingAmendment && (
            <EditTermsDialog
              userId={residentUserId}
              residentName={residentName}
              currentRent={terms.rent_amount}
              currentAdminFee={terms.admin_fee ?? 0}
              currentPaymentFrequency={terms.payment_frequency}
              currentCommitmentTerm={terms.commitment_term ?? null}
              currentRestrictionsNotes={terms.restrictions_notes ?? null}
              currentNotes={terms.notes ?? null}
              effectiveDateDefault={effectiveDefault}
            />
          )}
        </div>
        {pendingAmendment && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-1">
            <p className="text-xs font-semibold text-amber-900">
              Amendment awaiting resident signature
            </p>
            <p className="text-xs text-amber-900">
              New rent {formatMoney(pendingAmendment.rent_amount)}
              {pendingAmendment.effective_date
                ? ` effective ${formatDate(pendingAmendment.effective_date)}`
                : ""}
              .{" "}
              {pendingAmendment.amendment_reason
                ? `Reason: ${pendingAmendment.amendment_reason}`
                : ""}
            </p>
            {isAdmin && (
              <div className="space-y-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-amber-900 hover:bg-amber-100"
                  disabled={cancelPending}
                  onClick={() =>
                    startCancel(async () => {
                      setCancelError(null);
                      const res = await cancelPendingAmendment(
                        pendingAmendment.id
                      );
                      if (res?.error) {
                        setCancelError(res.error);
                        return;
                      }
                      router.refresh();
                    })
                  }
                >
                  {cancelPending ? "Cancelling…" : "Cancel amendment"}
                </Button>
                {cancelError && (
                  <p className="text-[11px] text-red-700">
                    Could not cancel: {cancelError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          To change these terms, a new commitment amendment is drafted and
          sent to the resident for signature. Current terms stay active
          until the amendment is signed.
        </p>
      </CardContent>
    </Card>
  );
}
