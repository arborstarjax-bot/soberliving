"use client";

// "Pay Upcoming Rent" dialog — paired with the virtual Next Rent
// card that renders when there's no open rent charge yet. Posts to
// createPayment with a commitment_id (not a charge_id); the server
// action materializes the next rent cycle's charge on demand and
// applies the payment to it. This keeps the opener's single-cycle
// guarantee (never pre-opening months of future rows) while still
// letting staff collect rent a few days before the scheduled due
// day.

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createPayment } from "./actions";
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
import { DollarSign } from "lucide-react";
import { formatDateOnly } from "@/lib/timezone";

interface Props {
  commitmentId: string;
  residentId: string;
  residentName: string;
  houseId: string;
  rentAmount: number;
  nextDueDate: string; // YYYY-MM-DD
  variant?: "default" | "outline";
  size?: "sm" | "default";
  label?: string;
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function RecordUpcomingRentDialog({
  commitmentId,
  residentId,
  residentName,
  houseId,
  rentAmount,
  nextDueDate,
  variant = "outline",
  size = "sm",
  label = "Record Payment",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(rentAmount.toFixed(2));
  const [state, action, pending] = useActionState(createPayment, undefined);

  // Close + refresh after a successful submission. queueMicrotask
  // defers the setOpen out of the render path (avoids the
  // react-hooks/set-state-in-effect lint rule).
  if (open && !pending && state && !state.error) {
    queueMicrotask(() => {
      setOpen(false);
      router.refresh();
    });
  }

  const amountNum = Number(amount);
  const isPartial =
    Number.isFinite(amountNum) && amountNum > 0 && amountNum < rentAmount;

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={size === "sm" ? "h-8 gap-1.5" : "gap-1.5"}
        onClick={() => {
          setAmount(rentAmount.toFixed(2));
          setOpen(true);
        }}
      >
        <DollarSign className="h-3.5 w-3.5" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pay Upcoming Rent</DialogTitle>
            <DialogDescription>
              {residentName} · Rent due{" "}
              {formatDateOnly(nextDueDate)} ·{" "}
              {formatMoney(rentAmount)} billed
            </DialogDescription>
          </DialogHeader>
          <form action={action} className="space-y-3">
            <input type="hidden" name="resident_id" value={residentId} />
            <input type="hidden" name="house_id" value={houseId} />
            <input type="hidden" name="commitment_id" value={commitmentId} />
            <input type="hidden" name="payment_type" value="rent" />
            <input type="hidden" name="paid_at" value={todayIso} />

            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {isPartial && (
                <p className="text-xs text-amber-600 mt-1">
                  Partial payment — {formatMoney(rentAmount - amountNum)} will
                  remain open on the rent charge once created.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="payment_method">Method</Label>
              <select
                id="payment_method"
                name="payment_method"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">Select</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="money_order">Money Order</option>
                <option value="venmo">Venmo</option>
                <option value="zelle">Zelle</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                name="note"
                rows={2}
                placeholder="Paid early for vacation, etc."
              />
            </div>

            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Recording…" : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
