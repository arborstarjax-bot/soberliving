"use client";

// Hard delete a payment — admin only, for cleanup of mistaken entries.
// Void remains the right call whenever we want an audit trail; delete
// is for "this never should have been recorded in the first place".
// The server action reverses the charge balance, removes the receipt
// PDF + documents row, deletes the payment, and logs the event to the
// activity feed so the deletion itself stays traceable.

import { useActionState, useState } from "react";
import { deletePayment } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  paymentId: string;
  amount: number;
  residentName: string;
}

export function DeletePaymentDialog({
  paymentId,
  amount,
  residentName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<
    { error?: string } | null,
    FormData
  >(deletePayment, null);

  // Defer close + refresh so it runs outside render (avoids the
  // react-hooks/set-state-in-effect lint rule). See edit-terms-dialog
  // for the same pattern — initial state of `null` keeps us from
  // auto-closing on mount.
  if (open && !pending && state && !state.error) {
    queueMicrotask(() => {
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            aria-label="Delete payment"
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Payment</DialogTitle>
          <DialogDescription>
            Permanently delete the ${amount.toFixed(2)} payment for{" "}
            <strong>{residentName}</strong>? The linked charge balance
            is reversed and the receipt PDF is removed. This cannot
            be undone — use Void instead if you need an audit record.
          </DialogDescription>
        </DialogHeader>
        <form action={action}>
          <input type="hidden" name="payment_id" value={paymentId} />
          {state?.error && (
            <p className="text-sm text-destructive mb-2">{state.error}</p>
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
              {pending ? "Deleting…" : "Delete Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
