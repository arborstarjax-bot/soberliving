"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/signature-pad";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitStaffSignoff } from "./actions";
import { generateIntakePdf } from "@/app/(intake)/intake/generate-pdf";
import { getHouseToday } from "@/lib/timezone";

interface Props {
  userId: string;
  userName: string;
  /** Existing form_data stored on the intake_forms row. */
  formData: Record<string, unknown>;
  /** Existing resident-side signatures (ignored — we only read for regen). */
  signatures: Record<string, string>;
  onSigned: () => void;
}

/**
 * One-shot staff sign-off on a submitted resident application.
 *
 * Captures a single signature + printed name + date. When submitted,
 * regenerates the intake PDF client-side with every staff/witness slot
 * pre-filled (application staff sig, all policy witness sigs, ROI
 * witness sig) and sends the bytes up to `submitStaffSignoff`, which
 * merges the fields into the stored payload, replaces the packet in
 * storage, and marks the timestamp so the Approve & Assign gate opens.
 */
export function StaffSignoffForm({
  userId,
  userName,
  formData,
  signatures,
  onSigned,
}: Props) {
  const [signature, setSignature] = useState<string | null>(null);
  const [printedName, setPrintedName] = useState("");
  const [date, setDate] = useState<string>(getHouseToday());
  const [useToday, setUseToday] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    if (!signature) return setError("Draw a staff signature");
    if (!printedName.trim()) return setError("Enter your printed name");
    if (!date) return setError("Pick a date (or tick 'Use today's date')");

    startTransition(async () => {
      try {
        // Normalize the stored form_data to the Record<string,string>
        // shape the PDF generator expects.
        const stringFormData: Record<string, string> = {};
        for (const [k, v] of Object.entries(formData)) {
          if (v == null) continue;
          stringFormData[k] = typeof v === "string" ? v : String(v);
        }

        const pdfBase64 = await generateIntakePdf(
          stringFormData,
          signatures,
          { signature, printedName: printedName.trim(), date }
        );

        const res = await submitStaffSignoff({
          userId,
          signature,
          printedName: printedName.trim(),
          date,
          pdfBase64,
        });

        if ("error" in res && res.error) {
          setError(res.error);
          return;
        }
        onSigned();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-off failed");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          Staff Sign-Off — {userName}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign once to fill every staff and witness signature slot in the packet
          (application, all policy pages, ROI). After sign-off, the Approve &amp;
          Assign step will unlock.
        </p>
      </div>

      <SignaturePad
        label="Staff Signature"
        initialValue={signature}
        onSignatureChange={setSignature}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="staff_printed_name">Printed Name *</Label>
          <Input
            id="staff_printed_name"
            value={printedName}
            onChange={(e) => setPrintedName(e.target.value)}
            placeholder="Your full name"
            required
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="staff_date">Date *</Label>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useToday}
                onChange={(e) => {
                  setUseToday(e.target.checked);
                  if (e.target.checked) setDate(getHouseToday());
                }}
                className="h-3.5 w-3.5 cursor-pointer"
              />
              Use today&apos;s date
            </label>
          </div>
          <Input
            id="staff_date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (e.target.value !== getHouseToday()) setUseToday(false);
            }}
            required
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full sm:w-auto">
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing &amp; regenerating packet…
          </>
        ) : (
          <>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Sign Off &amp; Regenerate Packet
          </>
        )}
      </Button>
    </div>
  );
}
