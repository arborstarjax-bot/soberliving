"use client";

// Admin-only "Edit Commitment Agreement" dialog.
//
// Editing commitment terms isn't a direct update — per David, the
// change has to flow through a new signed commitment agreement. So
// this dialog drafts a full amendment (same shape as the initial
// commitment from intake review), stamps the resident with a pending
// signature request, and returns. The resident signs through the
// normal /sign-commitment flow; activation happens on signature.
//
// The dashboard layout already redirects any resident with a
// pending_resident_signature commitment into /sign-commitment on every
// navigation (see `src/app/(dashboard)/layout.tsx` — the
// has_pending_commitment check), so submitting this dialog doubles as
// a hard blocker: the resident can't use the app until they sign.

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
  // Current active commitment values — seed the form so the admin
  // only has to change what's different. Matches the same shape as
  // the intake-review form defaults.
  currentRent: number;
  currentAdminFee: number;
  currentPaymentFrequency: "weekly" | "monthly";
  currentCommitmentTerm: string | null;
  currentRestrictionsNotes: string | null;
  currentNotes: string | null;
  effectiveDateDefault: string; // YYYY-MM-DD
}

export function EditTermsDialog({
  userId,
  residentName,
  currentRent,
  currentAdminFee,
  currentPaymentFrequency,
  currentCommitmentTerm,
  currentRestrictionsNotes,
  currentNotes,
  effectiveDateDefault,
}: Props) {
  const [paymentFrequency, setPaymentFrequency] = useState<"weekly" | "monthly">(
    currentPaymentFrequency
  );
  // Default to "paid prior / waived" because admin fees are one-time
  // move-in fees. An amendment almost never re-opens them — the fee
  // was already collected against the original commitment. Admin can
  // explicitly untick if they want a new admin_fee charge opened on
  // the amendment (rare: e.g. resident moved out + re-enrolled).
  const [adminFeePaidPrior, setAdminFeePaidPrior] = useState(true);
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
        Edit Commitment Agreement
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Amend Commitment — {residentName}</DialogTitle>
            <DialogDescription>
              Drafts an updated commitment agreement with the new terms.{" "}
              <strong>The resident is blocked from using the app</strong>{" "}
              until they review and sign. Current terms stay active until
              then.
            </DialogDescription>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <input type="hidden" name="user_id" value={userId} />

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payment Terms
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="payment_frequency">Payment Frequency</Label>
                  <select
                    id="payment_frequency"
                    name="payment_frequency"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    value={paymentFrequency}
                    onChange={(e) =>
                      setPaymentFrequency(
                        e.target.value as "weekly" | "monthly"
                      )
                    }
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rent_amount">
                    {paymentFrequency === "weekly"
                      ? "Weekly Rent"
                      : "Monthly Rent"}
                  </Label>
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
                <div className="space-y-1.5">
                  <Label htmlFor="admin_fee">Administrative Fee</Label>
                  <Input
                    id="admin_fee"
                    name="admin_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={currentAdminFee.toFixed(2)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="effective_date">
                    Effective Date / New Cycle Anchor
                  </Label>
                  <Input
                    id="effective_date"
                    name="effective_date"
                    type="date"
                    defaultValue={effectiveDateDefault}
                    required
                  />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="admin_fee_paid_prior"
                  checked={adminFeePaidPrior}
                  onChange={(e) => setAdminFeePaidPrior(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>
                  <span className="font-medium">
                    Admin fee already paid / waived
                  </span>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Default. Leave ticked for ordinary amendments — the
                    one-time admin fee was already collected against the
                    original commitment. Untick only if you want a brand-new
                    admin_fee charge opened on this amendment (rare).
                  </span>
                </span>
              </label>
            </section>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Agreement Details
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="commitment_term">Commitment Term</Label>
                <Input
                  id="commitment_term"
                  name="commitment_term"
                  type="text"
                  defaultValue={currentCommitmentTerm ?? "181 days"}
                  placeholder="e.g. 181 days"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="restrictions_notes">
                  Restrictions (optional)
                </Label>
                <Textarea
                  id="restrictions_notes"
                  name="restrictions_notes"
                  rows={2}
                  defaultValue={currentRestrictionsNotes ?? ""}
                  placeholder="e.g. No overnight guests for first 30 days"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Additional Notes (optional)</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  defaultValue={currentNotes ?? ""}
                />
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reason for Change
              </p>
              <Textarea
                id="reason"
                name="reason"
                required
                rows={3}
                placeholder="e.g. Rate increase effective next cycle — house-wide adjustment"
              />
              <p className="text-[11px] text-muted-foreground">
                {paymentFrequency === "weekly"
                  ? "Future rent charges will open on the same weekday as the effective date, every week. Rent is due the day before each cycle begins."
                  : "Future rent charges will open on the chosen day of each month. Rent is due the day before each cycle begins."}{" "}
                Unpaid open rent charges on or after the effective date are
                replaced with new-rate charges. Paid/partial rent charges are
                preserved as historical record.
              </p>
            </section>

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
