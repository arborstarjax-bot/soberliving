"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, AlertCircle, Calendar } from "lucide-react";
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

export function NextDueCard({
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
    <Card
      className={
        isPastDue
          ? "border-destructive/60 bg-destructive/5"
          : isDueSoon
            ? "border-amber-500/50 bg-amber-50/60"
            : ""
      }
    >
      <CardContent className="py-4 space-y-3">
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
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canRecordPayment && (
            <RecordChargePaymentDialog
              residentId={residentId}
              residentName={residentName}
              houseId={houseId}
              charge={charge}
              variant="default"
              size="default"
              label={`Record Payment · ${formatMoney(remaining)}`}
            />
          )}
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
        </div>
      </CardContent>
    </Card>
  );
}
