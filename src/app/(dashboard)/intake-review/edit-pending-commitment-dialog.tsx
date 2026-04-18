"use client";

// Edit an unsigned house commitment in place.
//
// Used for commitments in the "pending_resident_signature" state
// BEFORE the resident has signed. Since no PDF has been stamped and
// no charges have opened yet, the row is still a draft — we update
// it directly (no amendment chain needed) and resend the signature
// request to the resident.
//
// For edits to ALREADY-SIGNED (active) commitments, see
// `EditTermsDialog` which uses the proposeAmendment flow.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileEdit } from "lucide-react";
import { updatePendingCommitment } from "./actions";

interface Props {
  userId: string;
  residentName: string;
  current: {
    paymentFrequency: "weekly" | "monthly";
    rentAmount: number;
    adminFee: number;
    commitmentStartDate: string; // YYYY-MM-DD
    commitmentTerm: string;
    notes: string | null;
  };
  triggerLabel?: string;
  triggerSize?: "sm" | "default";
}

// Rent Due Date is derived from frequency + start date so staff
// can't enter something inconsistent with the schedule. Matches
// the logic in intake-review-form.tsx.
function deriveRentDueDate(
  frequency: "weekly" | "monthly",
  startDate: string
): string {
  if (!startDate) return "";
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  // Construct at UTC midnight and read weekday in UTC so the day
  // name lines up with the stored calendar day no matter which
  // timezone the caller runs in.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (frequency === "weekly") {
    const weekday = dt.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
    return `Every ${weekday}`;
  }
  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
  };
  return `${ordinal(d)} of each month`;
}

export function EditPendingCommitmentDialog({
  userId,
  residentName,
  current,
  triggerLabel = "Edit & Resend",
  triggerSize = "sm",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [paymentFrequency, setPaymentFrequency] = useState(
    current.paymentFrequency
  );
  const [rentAmount, setRentAmount] = useState(current.rentAmount.toFixed(2));
  const [adminFee, setAdminFee] = useState(current.adminFee.toFixed(2));
  const [commitmentStartDate, setCommitmentStartDate] = useState(
    current.commitmentStartDate
  );
  const [commitmentTerm, setCommitmentTerm] = useState(current.commitmentTerm);
  const [notes, setNotes] = useState(current.notes ?? "");

  const rentDueDate = deriveRentDueDate(paymentFrequency, commitmentStartDate);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const rent = parseFloat(rentAmount);
    const fee = parseFloat(adminFee);
    if (!Number.isFinite(rent) || rent <= 0) {
      setError("Rent must be a positive number");
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      setError("Admin fee must be zero or positive");
      return;
    }
    if (!commitmentStartDate) {
      setError("Commitment start date is required");
      return;
    }
    if (!commitmentTerm.trim()) {
      setError("Commitment term is required");
      return;
    }

    startTransition(async () => {
      const result = await updatePendingCommitment({
        userId,
        paymentFrequency,
        rentAmount: rent,
        adminFee: fee,
        rentDueDate,
        commitmentStartDate,
        commitmentTerm: commitmentTerm.trim(),
        notes: notes.trim() || undefined,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size={triggerSize}
        variant="outline"
        className="h-8 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <FileEdit className="h-3.5 w-3.5" />
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Pending Commitment — {residentName}</DialogTitle>
            <DialogDescription>
              The commitment hasn&apos;t been signed yet, so changes update
              the original agreement. The resident will get a new signature
              request.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="payment_frequency">Payment Frequency</Label>
                <select
                  id="payment_frequency"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={paymentFrequency}
                  onChange={(e) =>
                    setPaymentFrequency(e.target.value as "weekly" | "monthly")
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="commitment_start_date">Start Date</Label>
                <Input
                  id="commitment_start_date"
                  type="date"
                  value={commitmentStartDate}
                  onChange={(e) => setCommitmentStartDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rent_amount">Sober Living Fee</Label>
                <Input
                  id="rent_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rentAmount}
                  onChange={(e) => setRentAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin_fee">Admin Fee</Label>
                <Input
                  id="admin_fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={adminFee}
                  onChange={(e) => setAdminFee(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rent_due_date">Rent Due Date</Label>
                <Input
                  id="rent_due_date"
                  value={rentDueDate}
                  readOnly
                  disabled
                  className="bg-muted/50"
                />
                <p className="text-[11px] text-muted-foreground">
                  Auto-calculated from frequency + start date.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="commitment_term">Commitment Term</Label>
                <Input
                  id="commitment_term"
                  value={commitmentTerm}
                  onChange={(e) => setCommitmentTerm(e.target.value)}
                  placeholder="e.g. 181 days"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — arrangement details, special conditions, etc."
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save & Resend"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
