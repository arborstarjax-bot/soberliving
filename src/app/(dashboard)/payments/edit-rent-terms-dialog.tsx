"use client";

// Edit Rent Terms — the simple rent path. Sets amount, weekly vs
// monthly, and the next due date on the resident's active commitment.
// Charges re-derive from that schedule; no re-signature needed for a
// plain rent change (the signed agreement PDF stays as the original
// contract document).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRentTerms } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

interface Props {
  commitmentId: string;
  residentName: string;
  currentAmount: number | null;
  currentFrequency: "weekly" | "monthly" | null;
  currentAdminFee: number | null;
  nextDue: string | null;
}

export function EditRentTermsDialog({
  commitmentId,
  residentName,
  currentAmount,
  currentFrequency,
  currentAdminFee,
  nextDue,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateRentTerms(undefined, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3 w-3" />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rent Terms — {residentName}</DialogTitle>
          </DialogHeader>
          <form action={submit} className="space-y-4">
            <input type="hidden" name="commitment_id" value={commitmentId} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rent_amount">Rent Amount *</Label>
                <Input
                  id="rent_amount"
                  name="rent_amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  defaultValue={currentAmount ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_frequency">Charged *</Label>
                <select
                  id="payment_frequency"
                  name="payment_frequency"
                  required
                  defaultValue={currentFrequency ?? "weekly"}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin_fee">
                Admin Fee{" "}
                <span className="text-muted-foreground">
                  (optional, one-time)
                </span>
              </Label>
              <Input
                id="admin_fee"
                name="admin_fee"
                type="number"
                step="0.01"
                min="0"
                placeholder="Leave blank for none"
                defaultValue={currentAdminFee ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_due_date">Next Due Date *</Label>
              <Input
                id="next_due_date"
                name="next_due_date"
                type="date"
                required
                defaultValue={nextDue ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                Rent then repeats on this cadence. Unpaid past-due charges
                stay on the books.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
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
                {pending ? "Saving…" : "Save Terms"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
