"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { EditPendingCommitmentDialog } from "@/app/(dashboard)/intake-review/edit-pending-commitment-dialog";
import { ResendCommitmentButton } from "@/app/(dashboard)/intake-review/resend-commitment-button";
import { MarkCompleteButton } from "@/app/(dashboard)/intake-review/mark-complete-button";
import type { PendingInitialCommitment } from "./types";
import { formatDate, formatMoney } from "./helpers";

export function PendingCommitmentCard({
  pending,
  isAdmin,
  residentUserId,
  residentName,
}: {
  pending: PendingInitialCommitment;
  isAdmin: boolean;
  residentUserId: string;
  residentName: string;
}) {
  // Awaiting-signature state for the initial commitment. This is the
  // admin's staging area — they can still edit the terms in place
  // (no amendment needed because nothing has been signed), resend the
  // signature request, or mark complete on the resident's behalf.
  return (
    <Card className="border-yellow-400/60 bg-yellow-50/40">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-yellow-700" />
            <p className="text-sm font-semibold">Payment Terms (Draft)</p>
          </div>
          <Badge
            variant="outline"
            className="border-yellow-400 text-yellow-700 text-[10px]"
          >
            Awaiting Resident Signature
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">
              {pending.paymentFrequency === "weekly"
                ? "Weekly Rent"
                : "Monthly Rent"}
            </p>
            <p className="font-semibold">{formatMoney(pending.rentAmount)}</p>
          </div>
          {pending.adminFee > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Admin Fee</p>
              <p className="font-semibold">{formatMoney(pending.adminFee)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Start Date</p>
            <p className="font-semibold">
              {pending.commitmentStartDate
                ? formatDate(pending.commitmentStartDate)
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Term</p>
            <p className="font-semibold">{pending.commitmentTerm || "—"}</p>
          </div>
          {pending.rentDueDate && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Rent Due</p>
              <p className="font-semibold">{pending.rentDueDate}</p>
            </div>
          )}
        </div>
        {pending.notes && (
          <p className="rounded-md border bg-background/60 p-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Notes:</span>{" "}
            {pending.notes}
          </p>
        )}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <EditPendingCommitmentDialog
              userId={residentUserId}
              residentName={residentName}
              current={{
                paymentFrequency: pending.paymentFrequency,
                rentAmount: pending.rentAmount,
                adminFee: pending.adminFee,
                commitmentStartDate: pending.commitmentStartDate,
                commitmentTerm: pending.commitmentTerm,
                notes: pending.notes,
              }}
            />
            <ResendCommitmentButton
              userId={residentUserId}
              userName={residentName}
            />
            <MarkCompleteButton
              userId={residentUserId}
              userName={residentName}
            />
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          The resident hasn&apos;t signed yet. Edits update the original
          agreement in place and resend the signature request. Once signed,
          changes will require an amendment.
        </p>
      </CardContent>
    </Card>
  );
}
