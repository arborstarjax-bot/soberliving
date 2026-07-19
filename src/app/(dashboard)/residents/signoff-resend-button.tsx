"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CheckCircle, Loader2 } from "lucide-react";
import { SignaturePad } from "@/components/signature-pad";
import { signOffResendApplication } from "./actions";
import { generateIntakePdf } from "@/app/(intake)/intake/generate-pdf";
import { getHouseToday } from "@/lib/timezone";

interface Props {
  userId: string;
  residentName: string;
  formData: Record<string, unknown>;
  signatures: Record<string, string>;
  facilityName: string;
}

export function SignOffResendButton({
  userId,
  residentName,
  formData,
  signatures,
  facilityName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [printedName, setPrintedName] = useState("");
  const [date, setDate] = useState<string>(getHouseToday());
  const [useToday, setUseToday] = useState(true);

  function handleSignOff() {
    setError(null);
    if (!signature) return setError("Please draw your signature");
    if (!printedName.trim()) return setError("Enter your printed name");
    if (!date) return setError("Pick a date");

    startTransition(async () => {
      try {
        // Convert form data to string record for PDF generation
        const stringFormData: Record<string, string> = {};
        for (const [k, v] of Object.entries(formData)) {
          if (v == null) continue;
          stringFormData[k] = typeof v === "string" ? v : String(v);
        }

        // Generate the PDF with staff signature populated
        const pdfBase64 = await generateIntakePdf(
          stringFormData,
          signatures,
          { signature, printedName: printedName.trim(), date },
          facilityName
        );

        const result = await signOffResendApplication(userId, {
          signature,
          printedName: printedName.trim(),
          date,
          pdfBase64,
        });

        if (result?.error) {
          setError(result.error);
        } else {
          setOpen(false);
          setSignature(null);
          setPrintedName("");
          setDate(getHouseToday());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-off failed");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
        Sign Off
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign Off Application — {residentName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Sign below to confirm you have reviewed the resent application.
        </p>

        <div className="space-y-4">
          <SignaturePad
            label="Staff Signature"
            initialValue={signature}
            onSignatureChange={setSignature}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="signoff_printed_name">Printed Name *</Label>
              <Input
                id="signoff_printed_name"
                value={printedName}
                onChange={(e) => setPrintedName(e.target.value)}
                placeholder="Your full name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="signoff_date">Date *</Label>
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
                id="signoff_date"
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

          <Button
            onClick={handleSignOff}
            disabled={pending}
            className="w-full"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing &amp; generating packet…
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Sign Off Application
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
