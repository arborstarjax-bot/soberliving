"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/signature-pad";
import { signCommitment } from "./actions";

interface CommitmentSigningFormProps {
  commitmentId: string;
  residentName: string;
  houseName: string;
  propertyLocation: string;
  rentAmount: number;
  adminFee: number;
  paymentFrequency: string;
  rentDueDate: string;
  commitmentStartDate: string;
  commitmentTerm: string;
  notes: string | null;
  staffSignature: string | null;
  staffSignedAt: string | null;
}

export function CommitmentSigningForm({
  commitmentId,
  residentName,
  houseName,
  propertyLocation,
  rentAmount,
  adminFee,
  paymentFrequency,
  rentDueDate,
  commitmentStartDate,
  commitmentTerm,
  notes,
  staffSignature,
  staffSignedAt,
}: CommitmentSigningFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [residentSignature, setResidentSignature] = useState<string | null>(null);

  const generatePdf = useCallback(async (): Promise<string> => {
    const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const page = pdf.addPage([612, 792]);
    const { height } = page.getSize();
    let y = height - 50;

    const drawText = (text: string, x: number, yPos: number, size = 10, bold = false) => {
      page.drawText(text, { x, y: yPos, size, font: bold ? fontBold : font, color: rgb(0, 0, 0) });
    };

    // Title
    drawText("JAX SOBER LIVING", 200, y, 16, true);
    y -= 20;
    drawText("HOUSE COMMITMENT AGREEMENT", 180, y, 14, true);
    y -= 30;

    // Agreement details
    drawText(`Resident: ${residentName}`, 50, y, 11);
    y -= 18;
    drawText(`Property: ${houseName} — ${propertyLocation}`, 50, y, 11);
    y -= 18;
    drawText(`Start Date: ${commitmentStartDate}`, 50, y, 11);
    drawText(`Term: ${commitmentTerm}`, 350, y, 11);
    y -= 30;

    // Agreement body
    drawText("TERMS AND CONDITIONS:", 50, y, 12, true);
    y -= 20;

    const terms = [
      `1. RENT: The monthly sober living fee is $${rentAmount.toFixed(2)}, due ${rentDueDate}.`,
      `   Payment frequency: ${paymentFrequency}.`,
      `2. ADMINISTRATIVE FEE: A non-refundable administrative fee of $${adminFee.toFixed(2)} is due upon move-in.`,
      `3. COMMITMENT: Resident commits to a minimum stay of ${commitmentTerm} from the start date.`,
      `4. EARLY MOVE-OUT: Resident must provide at least 48 hours written notice prior to early departure.`,
      "5. HOUSE RULES: Resident agrees to abide by all house rules, including but not limited to:",
      "   - Maintain sobriety at all times while on the premises",
      "   - Attend required house meetings and programs",
      "   - Complete assigned chores on schedule",
      "   - Respect quiet hours and other residents' privacy",
      "   - No overnight guests without prior approval",
      "   - Submit to random drug/alcohol testing",
      "6. VIOLATIONS: Any violation of house rules may result in demerits, fines, or discharge.",
      "7. DISCHARGE: Management reserves the right to discharge any resident for rule violations,",
      "   non-payment of fees, or behavior deemed harmful to the recovery community.",
    ];

    for (const line of terms) {
      drawText(line, 50, y, 9);
      y -= 14;
    }

    if (notes) {
      y -= 10;
      drawText("ADDITIONAL NOTES:", 50, y, 11, true);
      y -= 16;
      const noteLines = notes.split("\n");
      for (const line of noteLines) {
        drawText(line, 50, y, 9);
        y -= 14;
      }
    }

    y -= 20;
    drawText("SIGNATURES:", 50, y, 12, true);
    y -= 25;

    // Staff signature
    drawText("Staff Signature:", 50, y, 10, true);
    if (staffSignature) {
      try {
        const sigBytes = Uint8Array.from(atob(staffSignature.split(",")[1] || ""), (c) => c.charCodeAt(0));
        const sigImage = await pdf.embedPng(sigBytes);
        page.drawImage(sigImage, { x: 50, y: y - 55, width: 150, height: 40 });
      } catch {
        drawText("[Staff signature on file]", 50, y - 15, 9);
      }
    }
    drawText(
      `Date: ${staffSignedAt ? new Date(staffSignedAt).toLocaleDateString() : ""}`,
      250,
      y - 40,
      9
    );
    y -= 70;

    // Resident signature
    drawText("Resident Signature:", 50, y, 10, true);
    if (residentSignature) {
      try {
        const sigBytes = Uint8Array.from(atob(residentSignature.split(",")[1] || ""), (c) => c.charCodeAt(0));
        const sigImage = await pdf.embedPng(sigBytes);
        page.drawImage(sigImage, { x: 50, y: y - 55, width: 150, height: 40 });
      } catch {
        drawText("[Resident signature on file]", 50, y - 15, 9);
      }
    }
    drawText(`Date: ${new Date().toLocaleDateString()}`, 250, y - 40, 9);

    const pdfBytes = await pdf.save();
    const bytes = new Uint8Array(pdfBytes);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }, [residentName, houseName, propertyLocation, rentAmount, adminFee, paymentFrequency, rentDueDate, commitmentStartDate, commitmentTerm, notes, staffSignature, staffSignedAt, residentSignature]);

  function handleSubmit() {
    if (!residentSignature) {
      setError("Please sign the agreement before submitting");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const pdfBase64 = await generatePdf();
        const result = await signCommitment(commitmentId, residentSignature, pdfBase64);
        if (result.error) {
          setError(result.error);
        } else {
          router.push("/dashboard");
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Agreement Card */}
      <Card>
        <CardHeader>
          <CardTitle>Agreement Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-muted-foreground text-xs">Property</p>
              <p className="font-medium">{houseName}</p>
              {propertyLocation && (
                <p className="text-muted-foreground text-xs mt-1">{propertyLocation}</p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-muted-foreground text-xs">Start Date</p>
              <p className="font-medium">{new Date(commitmentStartDate).toLocaleDateString()}</p>
              <p className="text-muted-foreground text-xs mt-1">Term: {commitmentTerm}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-muted-foreground text-xs">Sober Living Fee</p>
              <p className="font-medium text-lg">${rentAmount.toFixed(2)}</p>
              <p className="text-muted-foreground text-xs mt-1">Due {rentDueDate} ({paymentFrequency})</p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-muted-foreground text-xs">Administrative Fee</p>
              <p className="font-medium text-lg">${adminFee.toFixed(2)}</p>
              <p className="text-muted-foreground text-xs mt-1">Non-refundable, due at move-in</p>
            </div>
          </div>

          {notes && (
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p className="text-muted-foreground text-xs mb-1">Notes</p>
              <p className="whitespace-pre-wrap">{notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Terms */}
      <Card>
        <CardHeader>
          <CardTitle>Terms and Conditions</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <ol className="space-y-2 text-sm">
            <li>
              <strong>RENT:</strong> The monthly sober living fee is ${rentAmount.toFixed(2)},
              due {rentDueDate}. Payment frequency: {paymentFrequency}.
            </li>
            <li>
              <strong>ADMINISTRATIVE FEE:</strong> A non-refundable administrative fee of
              ${adminFee.toFixed(2)} is due upon move-in.
            </li>
            <li>
              <strong>COMMITMENT:</strong> Resident commits to a minimum stay of {commitmentTerm} from
              the start date of {new Date(commitmentStartDate).toLocaleDateString()}.
            </li>
            <li>
              <strong>EARLY MOVE-OUT:</strong> Resident must provide at least 48 hours written
              notice prior to early departure.
            </li>
            <li>
              <strong>HOUSE RULES:</strong> Resident agrees to abide by all house rules, including
              but not limited to:
              <ul className="mt-1 space-y-1">
                <li>Maintain sobriety at all times while on the premises</li>
                <li>Attend required house meetings and programs</li>
                <li>Complete assigned chores on schedule</li>
                <li>Respect quiet hours and other residents&apos; privacy</li>
                <li>No overnight guests without prior approval</li>
                <li>Submit to random drug/alcohol testing</li>
              </ul>
            </li>
            <li>
              <strong>VIOLATIONS:</strong> Any violation of house rules may result in demerits,
              fines, or discharge.
            </li>
            <li>
              <strong>DISCHARGE:</strong> Management reserves the right to discharge any resident
              for rule violations, non-payment of fees, or behavior deemed harmful to the
              recovery community.
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Staff Signature (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Signature</CardTitle>
        </CardHeader>
        <CardContent>
          {staffSignature ? (
            <div className="space-y-2">
              <div className="border rounded-md bg-white p-2 w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={staffSignature}
                  alt="Staff signature"
                  className="h-16 w-auto"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Signed on {staffSignedAt ? new Date(staffSignedAt).toLocaleDateString() : "—"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Staff signature pending</p>
          )}
        </CardContent>
      </Card>

      {/* Resident Signature */}
      <Card>
        <CardHeader>
          <CardTitle>Your Signature</CardTitle>
          <p className="text-sm text-muted-foreground">
            By signing below, you agree to the terms and conditions outlined above.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <SignaturePad
            onSignatureChange={setResidentSignature}
            label="Resident Signature"
          />

          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={isPending || !residentSignature}
              size="lg"
            >
              {isPending ? "Signing Agreement..." : "Sign & Submit Agreement"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
