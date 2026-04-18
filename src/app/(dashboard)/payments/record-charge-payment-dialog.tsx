"use client";

// Per-charge Record Payment dialog. Scoped to a single open/past-due
// charge so the admin/manager doesn't have to re-pick the resident or
// the charge — they already opened the row. Partial payments allowed
// and flagged with a required note + amber warning.

import { useActionState, useEffect, useState } from "react";
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
import { formatDateOnly } from "@/lib/timezone";
import { DollarSign } from "lucide-react";

interface Props {
  residentId: string;
  residentName: string;
  houseId: string;
  charge: {
    id: string;
    charge_type: string;
    amount: number;
    paid_amount: number;
    due_date: string;
    period_start: string | null;
    period_end: string | null;
  };
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

function chargeTypeLabel(type: string): string {
  switch (type) {
    case "rent":
      return "Rent";
    case "admin_fee":
      return "Admin Fee";
    case "deposit":
      return "Deposit";
    default:
      return type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function chargeTypeToPaymentType(type: string): string {
  if (type === "admin_fee") return "fee";
  if (type === "deposit") return "deposit";
  if (type === "rent") return "rent";
  return "other";
}

export function RecordChargePaymentDialog({
  residentId,
  residentName,
  houseId,
  charge,
  variant = "outline",
  size = "sm",
  label = "Record Payment",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const balance = Math.max(0, Number(charge.amount) - Number(charge.paid_amount));
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [state, action, pending] = useActionState(createPayment, undefined);

  // Reset amount when opening, so reopening after a partial-with-note
  // flow doesn't leave the old value in the box.
  useEffect(() => {
    if (open) setAmount(balance.toFixed(2));
  }, [open, balance]);

  useEffect(() => {
    if (state && !state.error && !pending && open) {
      setOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pending]);

  const amountNum = Number(amount);
  const isPartial =
    Number.isFinite(amountNum) && amountNum > 0 && amountNum < balance;

  const todayIso = new Date().toISOString().slice(0, 10);

  // Past-due charges that are being partially paid need a note
  // explaining the shortfall (for our internal records). Paying a
  // chunk early against a future charge doesn't — splitting up rent
  // over multiple weeks is normal and shouldn't require paperwork.
  const isPastDue = charge.due_date < todayIso;
  const noteRequired = isPartial && isPastDue;

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={size === "sm" ? "h-8 gap-1.5" : "gap-1.5"}
        onClick={() => setOpen(true)}
      >
        <DollarSign className="h-3.5 w-3.5" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {residentName} · {chargeTypeLabel(charge.charge_type)} due{" "}
              {formatDateOnly(charge.due_date)} ·{" "}
              {formatMoney(balance)} open
            </DialogDescription>
          </DialogHeader>
          <form action={action} className="space-y-3">
            <input type="hidden" name="resident_id" value={residentId} />
            <input type="hidden" name="house_id" value={houseId} />
            <input type="hidden" name="charge_id" value={charge.id} />
            <input
              type="hidden"
              name="payment_type"
              value={chargeTypeToPaymentType(charge.charge_type)}
            />
            <input
              type="hidden"
              name="period_start"
              value={charge.period_start ?? ""}
            />
            <input
              type="hidden"
              name="period_end"
              value={charge.period_end ?? ""}
            />
            <input type="hidden" name="due_date" value={charge.due_date} />
            <input type="hidden" name="paid_at" value={todayIso} />

            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={balance.toFixed(2)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              {isPartial && (
                <p className="text-xs text-amber-600 font-medium mt-1">
                  Partial payment — {formatMoney(balance - amountNum)} will
                  remain open.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="payment_method">Payment Method</Label>
              <select
                id="payment_method"
                name="payment_method"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">Select method</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="money_order">Money Order</option>
                <option value="venmo">Venmo</option>
                <option value="zelle">Zelle</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <Label htmlFor="note">
                Note{" "}
                {noteRequired && (
                  <span className="text-amber-600">
                    (required — past-due partial)
                  </span>
                )}
              </Label>
              <Textarea
                id="note"
                name="note"
                rows={2}
                required={noteRequired}
                placeholder={
                  noteRequired
                    ? "Why can't the resident cover the full past-due amount?"
                    : "Optional note (internal)"
                }
              />
            </div>

            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Recording…" : `Record ${formatMoney(amountNum || 0)}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
