"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { adjustChargeAmount } from "./actions";
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
import { Pencil } from "lucide-react";

interface Props {
  chargeId: string;
  chargeType: string;
  currentAmount: number;
  paidAmount: number;
  residentName: string;
}

function chargeTypeLabel(type: string): string {
  switch (type) {
    case "rent":
      return "Rent";
    case "admin_fee":
      return "Admin Fee";
    case "deposit":
      return "Deposit";
    case "misc":
      return "Misc";
    default:
      return type.replace(/_/g, " ");
  }
}

export function AdjustChargeDialog({
  chargeId,
  chargeType,
  currentAmount,
  paidAmount,
  residentName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newAmount, setNewAmount] = useState(currentAmount.toFixed(2));
  const [state, action, pending] = useActionState<
    { error?: string } | null,
    FormData
  >(adjustChargeAmount, null);

  if (open && !pending && state && !state.error) {
    queueMicrotask(() => {
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs px-2"
        onClick={() => {
          setNewAmount(currentAmount.toFixed(2));
          setOpen(true);
        }}
      >
        <Pencil className="h-3 w-3" />
        Adjust
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Charge Amount</DialogTitle>
            <DialogDescription>
              {residentName} · {chargeTypeLabel(chargeType)} · Current: $
              {currentAmount.toFixed(2)}
              {paidAmount > 0 && ` ($${paidAmount.toFixed(2)} paid)`}
            </DialogDescription>
          </DialogHeader>
          <form action={action} className="space-y-3">
            <input type="hidden" name="charge_id" value={chargeId} />
            <div>
              <Label htmlFor="new_amount">New Amount</Label>
              <Input
                id="new_amount"
                name="new_amount"
                type="number"
                step="0.01"
                min={paidAmount}
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                required
              />
              {paidAmount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Minimum ${paidAmount.toFixed(2)} (already paid)
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                name="reason"
                required
                rows={2}
                placeholder="Why is this amount being changed?"
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
                {pending ? "Saving…" : "Save Adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
