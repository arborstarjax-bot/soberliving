"use client";

// Full-page amendment form for staff editing an already-signed house
// commitment. Mirrors the intake-review-form sections 1:1 (Rent
// Configuration, Notes, Admin Fee treatment, Staff Signature) plus a
// required "Reason for Change" textarea. On submit, hits
// proposeAmendment which drafts a new house_commitments row with
// status='pending_resident_signature'. The dashboard layout then
// hard-blocks the resident on /sign-commitment until they sign — the
// exact same gate used for initial intake.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Home, Info } from "lucide-react";
import { SignaturePad } from "@/components/signature-pad";
import { proposeAmendment } from "../../../payments/actions";

interface Props {
  residentId: string;
  userId: string;
  residentName: string;
  currentHouseName: string | null;
  currentHouseAddress: string | null;
  currentRoomName: string | null;
  currentBedLabel: string | null;
  currentRent: number;
  currentAdminFee: number;
  currentPaymentFrequency: "weekly" | "monthly";
  currentCommitmentTerm: string;
  currentRestrictionsNotes: string;
  currentNotes: string;
  effectiveDateDefault: string;
}

// Matches the helper used in intake-review-form.tsx and
// edit-pending-commitment-dialog.tsx so the derived rent-due-date
// string reads identically across every commitment surface.
function deriveRentDueDate(
  frequency: "weekly" | "monthly",
  startDate: string
): string {
  if (!startDate) return "";
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (frequency === "weekly") {
    const weekday = dt.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "long",
    });
    // Rent due dates sit one day before the technical anchor per
    // policy — e.g. Friday anchor → due Thursday. Only the display
    // label reflects this; the stored anchor remains the effective
    // date so cycle math stays clean.
    const priorWeekday = new Date(dt.getTime() - 24 * 60 * 60 * 1000);
    const priorName = priorWeekday.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "long",
    });
    return `Every ${priorName} (anchor ${weekday})`;
  }
  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
  };
  // Monthly due-day policy: due on the day BEFORE the anchor. Anchor
  // 26th → due 25th. Anchor 1st → due the last day of the preceding
  // month. The actual charge engine handles the month-rollover case;
  // the label just reflects the anchor for context.
  const priorDay = d === 1 ? "last" : ordinal(d - 1);
  return `${priorDay} day of each month (anchor ${ordinal(d)})`;
}

export function AmendCommitmentForm({
  residentId,
  userId,
  residentName,
  currentHouseName,
  currentHouseAddress,
  currentRoomName,
  currentBedLabel,
  currentRent,
  currentAdminFee,
  currentPaymentFrequency,
  currentCommitmentTerm,
  currentRestrictionsNotes,
  currentNotes,
  effectiveDateDefault,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [paymentFrequency, setPaymentFrequency] = useState<
    "weekly" | "monthly"
  >(currentPaymentFrequency);
  const [rentAmount, setRentAmount] = useState(currentRent.toFixed(2));
  const [adminFee, setAdminFee] = useState(currentAdminFee.toFixed(2));
  const [adminFeePaidPrior, setAdminFeePaidPrior] = useState(true);
  const [effectiveDate, setEffectiveDate] = useState(effectiveDateDefault);
  const [commitmentTerm, setCommitmentTerm] = useState(currentCommitmentTerm);
  const [restrictionsNotes, setRestrictionsNotes] = useState(
    currentRestrictionsNotes
  );
  const [notes, setNotes] = useState(currentNotes);
  const [reason, setReason] = useState("");
  const [staffSignature, setStaffSignature] = useState<string | null>(null);

  const rentDueDate = useMemo(
    () => deriveRentDueDate(paymentFrequency, effectiveDate),
    [paymentFrequency, effectiveDate]
  );

  const rentDelta = useMemo(() => {
    const next = parseFloat(rentAmount);
    if (!Number.isFinite(next)) return null;
    return next - currentRent;
  }, [rentAmount, currentRent]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const rent = parseFloat(rentAmount);
    const fee = parseFloat(adminFee);
    if (!Number.isFinite(rent) || rent < 0) {
      setError("Rent must be a non-negative number");
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      setError("Admin fee must be a non-negative number");
      return;
    }
    if (!effectiveDate) {
      setError("Effective date is required");
      return;
    }
    if (!commitmentTerm.trim()) {
      setError("Commitment term is required");
      return;
    }
    if (!reason.trim()) {
      setError("Reason for the change is required");
      return;
    }
    if (!staffSignature) {
      setError("Staff signature is required to send the amendment");
      return;
    }

    const fd = new FormData();
    fd.set("user_id", userId);
    fd.set("rent_amount", rent.toString());
    fd.set("admin_fee", fee.toString());
    if (adminFeePaidPrior) fd.set("admin_fee_paid_prior", "on");
    fd.set("payment_frequency", paymentFrequency);
    fd.set("effective_date", effectiveDate);
    fd.set("commitment_term", commitmentTerm.trim());
    fd.set("restrictions_notes", restrictionsNotes);
    fd.set("notes", notes);
    fd.set("reason", reason.trim());
    fd.set("staff_signature", staffSignature);

    startTransition(async () => {
      const result = await proposeAmendment(undefined, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`/residents/${residentId}?amendment_sent=1`);
      router.refresh();
    });
  }

  const housingLine = [
    currentHouseName,
    currentRoomName,
    currentBedLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          The resident will be hard-blocked from using the app (dashboard,
          check-ins, everything) until they review and sign this amended
          agreement on the same two-page commitment form used at intake.
        </div>
      </div>

      {/* Housing (read-only — use Transfer House to move beds) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Home className="h-4 w-4" /> Housing Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="font-medium">
            {housingLine || "No housing on file"}
          </div>
          {currentHouseAddress && (
            <div className="text-muted-foreground">{currentHouseAddress}</div>
          )}
          <p className="pt-2 text-xs text-muted-foreground">
            Amendments don&apos;t move the resident. Use Transfer House on the
            resident profile if the bed needs to change.
          </p>
        </CardContent>
      </Card>

      {/* Rent Configuration — mirrors intake-review section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rent Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment Frequency *</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={paymentFrequency}
                onChange={(e) =>
                  setPaymentFrequency(
                    e.target.value as "weekly" | "monthly"
                  )
                }
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>
                Rent Amount * ({paymentFrequency === "weekly" ? "per week" : "per month"})
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-7"
                  value={rentAmount}
                  onChange={(e) => setRentAmount(e.target.value)}
                />
              </div>
              {rentDelta !== null && rentDelta !== 0 && (
                <p className="text-xs text-muted-foreground">
                  {rentDelta > 0 ? "Increase" : "Decrease"} of $
                  {Math.abs(rentDelta).toFixed(2)} vs current $
                  {currentRent.toFixed(2)}.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Admin Fee</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-7"
                  value={adminFee}
                  onChange={(e) => setAdminFee(e.target.value)}
                />
              </div>
              <label className="flex items-start gap-2 pt-1 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={adminFeePaidPrior}
                  onChange={(e) => setAdminFeePaidPrior(e.target.checked)}
                />
                <span>
                  Admin fee already paid on the original commitment
                  <span className="block text-xs text-muted-foreground">
                    Uncheck only if you intend to charge a new admin fee.
                  </span>
                </span>
              </label>
            </div>
            <div className="space-y-2">
              <Label>Rent Due Date</Label>
              <Input value={rentDueDate} readOnly disabled />
              <p className="text-xs text-muted-foreground">
                Derived from frequency + effective date. Due one day before
                the anchor per policy.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Effective Date *</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                New rent schedule starts this day. Unpaid charges on/after
                this date on the current commitment are removed.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Commitment Term *</Label>
              <Input
                value={commitmentTerm}
                onChange={(e) => setCommitmentTerm(e.target.value)}
                placeholder="181 days"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Restrictions + Notes — mirror the matching fields on intake */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commitment Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Restrictions / Conditions</Label>
            <Textarea
              rows={3}
              value={restrictionsNotes}
              onChange={(e) => setRestrictionsNotes(e.target.value)}
              placeholder="Any restrictions or conditions specific to this resident"
            />
          </div>
          <div className="space-y-2">
            <Label>Additional Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this commitment (optional)"
            />
          </div>
        </CardContent>
      </Card>

      {/* Reason for change — only section that doesn't exist on intake */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reason for Change *</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is the commitment being amended? (required — surfaces on the resident's signed amendment record)"
          />
        </CardContent>
      </Card>

      {/* Staff Signature — mirrors intake-review section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff Signature</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            By signing below, you confirm the amended terms above and approve
            sending the updated agreement to the resident for signature.
          </p>
          <SignaturePad
            onSignatureChange={setStaffSignature}
            label="Admin/Manager Signature"
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link
          href={`/residents/${residentId}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
        >
          Cancel
        </Link>
        <Button
          type="submit"
          size="lg"
          disabled={isPending || !staffSignature || !reason.trim()}
        >
          {isPending
            ? "Sending to resident..."
            : `Send amended agreement to ${residentName}`}
        </Button>
      </div>
    </form>
  );
}
