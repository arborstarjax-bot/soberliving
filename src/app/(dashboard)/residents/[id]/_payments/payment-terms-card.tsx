"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { dayOfMonthLocal } from "@/lib/local-date";
import { getDocumentUrl } from "@/app/(intake)/actions";
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
}: {
  terms: PaymentTerms;
  isAdmin: boolean;
  residentUserId: string | null;
  residentName: string;
  pendingAmendment: PendingAmendment | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();
  const [cancelPending, startCancel] = useTransition();
  // Pull the day-of-month directly from the ISO string — going
  // through `new Date(iso).getDate()` drifts a day in US timezones
  // because date-only strings parse as UTC midnight.
  const dueDay = dayOfMonthLocal(terms.commitment_start_date);

  async function openCommitment() {
    if (!terms.pdf_storage_path) return;
    setDownloading(true);
    try {
      const res = await getDocumentUrl(terms.pdf_storage_path);
      if (res.url) window.open(res.url, "_blank");
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
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Monthly Rent</p>
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
            <p className="font-semibold">{ordinal(dueDay)} of each month</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Effective</p>
            <p className="font-semibold">
              {formatDate(terms.commitment_start_date)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {terms.pdf_storage_path && (
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
          )}
          {isAdmin && residentUserId && !pendingAmendment && (
            <EditTermsDialog
              userId={residentUserId}
              residentName={residentName}
              currentRent={terms.rent_amount}
              currentAdminFee={terms.admin_fee}
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
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-amber-900 hover:bg-amber-100"
                disabled={cancelPending}
                onClick={() =>
                  startCancel(async () => {
                    await cancelPendingAmendment(pendingAmendment.id);
                    router.refresh();
                  })
                }
              >
                {cancelPending ? "Cancelling…" : "Cancel amendment"}
              </Button>
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
