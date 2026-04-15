"use client";

import { useActionState } from "react";
import { voidPayment } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Ban } from "lucide-react";

interface Props {
  paymentId: string;
  amount: number;
  residentName: string;
}

export function VoidPaymentDialog({ paymentId, amount, residentName }: Props) {
  const [state, action, pending] = useActionState(voidPayment, undefined);

  return (
    <Dialog>
      <DialogTrigger render={
        <Button variant="ghost" size="icon" />
      }>
        <Ban className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void Payment</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to void the ${amount.toFixed(2)} payment for{" "}
          <strong>{residentName}</strong>? This cannot be undone.
        </p>
        <form action={action}>
          <input type="hidden" name="payment_id" value={paymentId} />
          {state?.error && (
            <p className="text-sm text-destructive mb-2">{state.error}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Voiding…" : "Void Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
