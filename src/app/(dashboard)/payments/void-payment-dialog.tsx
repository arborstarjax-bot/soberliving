"use client";

// Void a payment — admin only. Required reason is stored on the
// payment row + the activity log entry so we have an audit trail of
// why any given void happened (wrong amount, duplicate, applied to
// wrong resident, etc).

import { useActionState, useState } from "react";
import { voidPayment } from "./actions";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  paymentId: string;
  amount: number;
  residentName: string;
}

export function VoidPaymentDialog({ paymentId, amount, residentName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<
    { error?: string } | null,
    FormData
  >(voidPayment, null);

  // Close + refresh after a successful submission only. Initial
  // state is `null` so this branch only fires once the server
  // action resolves. queueMicrotask defers the setState out of the
  // render path (avoids react-hooks/set-state-in-effect).
  if (open && !pending && state && !state.error) {
    queueMicrotask(() => {
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" />}>
        <Ban className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void Payment</DialogTitle>
          <DialogDescription>
            Voiding the ${amount.toFixed(2)} payment for{" "}
            <strong>{residentName}</strong>. The charge balance is
            rolled back and the payment row stays on the ledger with a
            void stamp. Provide a reason for the audit trail.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <input type="hidden" name="payment_id" value={paymentId} />
          <div>
            <Label htmlFor="reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              name="reason"
              required
              rows={3}
              placeholder="Why is this payment being voided?"
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
              {pending ? "Voiding…" : "Void Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
