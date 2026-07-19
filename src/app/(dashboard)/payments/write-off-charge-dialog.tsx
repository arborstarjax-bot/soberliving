"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { writeOffCharge } from "./actions";
import { Button } from "@/components/ui/button";
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
import { XCircle } from "lucide-react";

interface Props {
  chargeId: string;
  chargeType: string;
  amount: number;
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

export function WriteOffChargeDialog({
  chargeId,
  chargeType,
  amount,
  paidAmount,
  residentName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, amount - paidAmount);
  const [state, action, pending] = useActionState<
    { error?: string } | null,
    FormData
  >(writeOffCharge, null);

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
        className="h-7 gap-1 text-xs px-2 text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <XCircle className="h-3 w-3" />
        Write Off
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Write Off Charge</DialogTitle>
            <DialogDescription>
              Forgive the remaining ${remaining.toFixed(2)} on{" "}
              {residentName}&apos;s {chargeTypeLabel(chargeType)} charge ($
              {amount.toFixed(2)} total
              {paidAmount > 0 && `, $${paidAmount.toFixed(2)} paid`}). This
              removes it from the outstanding balance.
            </DialogDescription>
          </DialogHeader>
          <form action={action} className="space-y-3">
            <input type="hidden" name="charge_id" value={chargeId} />
            <div>
              <Label htmlFor="reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                name="reason"
                required
                rows={2}
                placeholder="Why is this charge being written off?"
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
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Writing off…" : `Write Off $${remaining.toFixed(2)}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
