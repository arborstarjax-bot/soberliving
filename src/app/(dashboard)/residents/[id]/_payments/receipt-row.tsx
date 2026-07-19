"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DownloadReceiptButton } from "@/app/(dashboard)/payments/download-receipt-button";
import { DeletePaymentDialog } from "@/app/(dashboard)/payments/delete-payment-dialog";
import { VoidPaymentDialog } from "@/app/(dashboard)/payments/void-payment-dialog";
import type { RecentPayment } from "./types";
import { formatDate, formatMoney, paymentLabel } from "./helpers";

export function ReceiptRow({
  payment,
  isAdmin,
  canVoid,
  residentName,
}: {
  payment: RecentPayment;
  isAdmin: boolean;
  canVoid: boolean;
  residentName: string;
}) {
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
        <div className="shrink-0 flex items-center gap-1">
          <DownloadReceiptButton
            storagePath={payment.receipt_storage_path}
            receiptNumber={payment.receipt_number}
          />
          {canVoid && !isVoid && (
            <VoidPaymentDialog
              paymentId={payment.id}
              amount={payment.amount}
              residentName={residentName}
            />
          )}
          {isAdmin && (
            <DeletePaymentDialog
              paymentId={payment.id}
              amount={payment.amount}
              residentName={residentName}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
