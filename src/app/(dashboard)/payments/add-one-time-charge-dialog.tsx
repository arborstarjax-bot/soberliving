"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { addOneTimeCharge } from "./actions";
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
import { Plus } from "lucide-react";
import { getHouseToday } from "@/lib/timezone";

interface Props {
  residentId: string;
  residentName: string;
  houseId: string;
}

export function AddOneTimeChargeDialog({
  residentId,
  residentName,
  houseId,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<
    { error?: string } | null,
    FormData
  >(addOneTimeCharge, null);

  const [dueDate, setDueDate] = useState("");

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
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        onClick={() => {
          setDueDate(getHouseToday());
          setOpen(true);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Charge
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add One-Time Charge</DialogTitle>
            <DialogDescription>
              Add a miscellaneous charge to {residentName}&apos;s balance. This
              does not require a new commitment agreement.
            </DialogDescription>
          </DialogHeader>
          <form action={action} className="space-y-3">
            <input type="hidden" name="resident_id" value={residentId} />
            <input type="hidden" name="house_id" value={houseId} />
            <div>
              <Label htmlFor="charge_type">Charge Type</Label>
              <select
                id="charge_type"
                name="charge_type"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                defaultValue="misc"
              >
                <option value="misc">Miscellaneous</option>
                <option value="admin_fee">Admin Fee</option>
                <option value="deposit">Deposit</option>
              </select>
            </div>
            <div>
              <Label htmlFor="charge_amount">Amount</Label>
              <Input
                id="charge_amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="description">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                name="description"
                required
                rows={2}
                placeholder="What is this charge for?"
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
                {pending ? "Adding…" : "Add Charge"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
