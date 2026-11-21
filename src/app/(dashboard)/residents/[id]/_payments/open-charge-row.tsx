"use client";

// Compact row for an open charge beyond the Next Due hero. Each row
// carries its own Record Payment button so staff can post against any
// open charge — e.g. pay rent while admin fee is still outstanding —
// instead of being forced through the earliest-due charge only.

import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { RecordChargePaymentDialog } from "@/app/(dashboard)/payments/record-charge-payment-dialog";
import { AdjustChargeDialog } from "@/app/(dashboard)/payments/adjust-charge-dialog";
import { WriteOffChargeDialog } from "@/app/(dashboard)/payments/write-off-charge-dialog";
import type { OpenCharge } from "./types";
import {
  chargeTypeLabel,
  daysUntil,
  formatDate,
  formatMoney,
} from "./helpers";

export function OpenChargeRow({
  charge,
  canRecordPayment,
  isAdmin,
  residentId,
  residentName,
  houseId,
}: {
  charge: OpenCharge;
  canRecordPayment: boolean;
  isAdmin: boolean;
  residentId: string;
  residentName: string;
  houseId: string;
}) {
  const days = daysUntil(charge.due_date);
  const isPastDue = days < 0;
  const isDueSoon = days >= 0 && days <= 3;
  const remaining = Math.max(0, charge.amount - charge.paid_amount);
  const isPartial = charge.paid_amount > 0;

  return (
    <div
      className={
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 " +
        (isPastDue
          ? "border-destructive/60 bg-destructive/5"
          : isDueSoon
            ? "border-amber-500/50 bg-amber-50/60"
            : "bg-card")
      }
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">
            {chargeTypeLabel(charge.charge_type)}
          </p>
          <Badge
            variant={
              isPastDue ? "destructive" : isDueSoon ? "secondary" : "outline"
            }
            className="whitespace-nowrap text-[10px] px-1.5 py-0"
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
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{formatDate(charge.due_date)}</span>
          <span>·</span>
          <span className="font-medium text-foreground">
            {formatMoney(remaining)}
          </span>
          {isPartial && (
            <span className="text-muted-foreground">
              ({formatMoney(charge.paid_amount)} paid)
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isAdmin && (
          <AdjustChargeDialog
            chargeId={charge.id}
            chargeType={charge.charge_type}
            currentAmount={charge.amount}
            paidAmount={charge.paid_amount}
            residentName={residentName}
          />
        )}
        {isAdmin && (
          <WriteOffChargeDialog
            chargeId={charge.id}
            chargeType={charge.charge_type}
            amount={charge.amount}
            paidAmount={charge.paid_amount}
            residentName={residentName}
          />
        )}
        {canRecordPayment && (
          <RecordChargePaymentDialog
            residentId={residentId}
            residentName={residentName}
            houseId={houseId}
            charge={charge}
            variant="outline"
            size="sm"
            label="Record Payment"
          />
        )}
      </div>
    </div>
  );
}
