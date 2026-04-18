"use client";

// Admin-only "Edit Payment Terms" dialog.
//
// Editing terms isn't a direct update — per David, the change has to
// flow through a new signed commitment agreement. So this dialog
// drafts an amendment, stamps the resident with a pending signature
// request, and returns. The resident signs through the normal
// /sign-commitment flow; activation happens on signature.

import { useActionState, useEffect, useRef, useState } from "react";
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
import { proposeAmendment } from "./actions";

interface Props {
  userId: string;
  residentName: string;
  currentRent: number;
  currentAdminFee: number | null;
  effectiveDateDefault: string; // YYYY-MM-DD
}

export function EditTermsDialog({
  userId,
  residentName,
  currentRent,
  currentAdminFee,
  effectiveDateDefault,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(proposeAmendment, {
    error: undefined,
  } as { error?: string });
  // Track whether a submit has been dispatched; without this, the
  // initial state `{ error: undefined }` matches "success" on the very
  // first render and closes the dialog immediately after opening.
  const submittedRef = useRef(false);

  function handleSubmit(formData: FormData) {
    submittedRef.current = true;
    formAction(formData);
  }

  useEffect(() => {
    if (!open || isPending || !submittedRef.current) return;
    if (state && !state.error) {
      submittedRef.current = false;
      // Defer to the next microtask so we're not calling setState
      // synchronously inside the effect body (avoids the react-hooks
      // set-state-in-effect warning — the underlying pattern is fine
      // because we only fire after the server action resolves, not on
      // every render).
      queueMicrotask(() => {
        setOpen(false);
        router.refresh();
      });
    }
  }, [state, isPending, open, router]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <FileEdit className="h-3.5 w-3.5" />
        Edit Terms
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Propose Amendment — {residentName}</DialogTitle>
            <DialogDescription>
              Drafts an updated commitment agreement. The resident must sign
              it before the new terms take effect; current terms stay active
              until then.
            </DialogDescription>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-3">
            <input type="hidden" name="user_id" value={userId} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rent_amount">Monthly Rent</Label>
                <Input
                  id="rent_amount"
                  name="rent_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={currentRent.toFixed(2)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="admin_fee">Admin Fee</Label>
                <Input
                  id="admin_fee"
                  name="admin_fee"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(currentAdminFee ?? 0).toFixed(2)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="effective_date">Effective Date</Label>
              <Input
                id="effective_date"
                name="effective_date"
                type="date"
                defaultValue={effectiveDateDefault}
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Future rent charges will open on this day each month. Past
                charges already opened at the old amount are preserved.
              </p>
            </div>

            <div>
              <Label htmlFor="reason">Reason for Change</Label>
              <Textarea
                id="reason"
                name="reason"
                required
                rows={3}
                placeholder="e.g. Rate increase effective next cycle — house-wide adjustment"
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
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Sending…" : "Send for Resident Signature"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
