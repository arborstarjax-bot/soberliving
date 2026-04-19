"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/signature-pad";
import { signCommitment } from "./actions";
import { formatDateOnly } from "@/lib/timezone";

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
  // Amendment context — when present, this commitment is a
  // payment-terms amendment to a previously signed one. We render
  // an "old vs new" comparison and a banner with the admin's reason.
  amendmentReason?: string | null;
  parentTerms?: {
    rent_amount: number;
    admin_fee: number | null;
    commitment_start_date: string;
  } | null;
  // Move-in context mirrored on the contract so the resident sees
  // exactly what was collected, any outstanding balance, whether
  // the admin fee was paid prior / waived, and any restrictions
  // placed on them at check-in. All optional so existing amendment
  // flows keep working without these fields.
  skipInitialAdminFee?: boolean;
  isExistingTenant?: boolean;
  restrictions?: Array<{
    restriction_type: string;
    description: string;
    end_date: string | null;
  }>;
  moveInSummary?: {
    totalCollected: number;
    adminFeeApplied: number;
    rentApplied: number;
    partialReason: string | null;
    paidAt: string;
    method: string;
  } | null;
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
  amendmentReason,
  parentTerms,
  skipInitialAdminFee = false,
  isExistingTenant = false,
  restrictions = [],
  moveInSummary = null,
}: CommitmentSigningFormProps) {
  const isAmendment = Boolean(parentTerms);
  const isWeekly = paymentFrequency?.toLowerCase() === "weekly";
  const frequencyLabel = isWeekly ? "Weekly" : "Monthly";
  const cycleLower = isWeekly ? "weekly" : "monthly";
  const perCycle = isWeekly ? "/wk" : "/mo";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [residentSignature, setResidentSignature] = useState<string | null>(null);
  // Paper contract has a "resident will initial the chosen property
  // location" step on page 1. We keep that behavior: resident types
  // initials to confirm they understand the specific address they're
  // bound to. Required before the full signature is accepted.
  const [residentInitials, setResidentInitials] = useState("");

  const generatePdf = useCallback(async (): Promise<string> => {
    const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let currentPage = pdf.addPage([612, 792]);
    const { height } = currentPage.getSize();
    let y = height - 50;

    const newPageIfNeeded = (needed: number) => {
      if (y - needed < 70) {
        currentPage = pdf.addPage([612, 792]);
        y = 792 - 50;
      }
    };

    const drawText = (text: string, x: number, yPos: number, size = 10, bold = false) => {
      currentPage.drawText(text, {
        x,
        y: yPos,
        size,
        font: bold ? fontBold : font,
        color: rgb(0, 0, 0),
      });
    };

    // Word-wrap helper — the contract body is prose, and the paper
    // contract uses long binding paragraphs that won't fit on a
    // single 512px line. Measures actual glyph width via pdf-lib
    // rather than guessing at a char count so wrapping is exact
    // across variable-width fonts.
    const drawParagraph = (
      text: string,
      opts?: { size?: number; bold?: boolean; indent?: number; spacingAfter?: number }
    ) => {
      const size = opts?.size ?? 9;
      const bold = opts?.bold ?? false;
      const indent = opts?.indent ?? 0;
      const spacingAfter = opts?.spacingAfter ?? 6;
      const lineHeight = size + 4;
      const x = 50 + indent;
      const maxWidth = 512 - indent;
      const activeFont = bold ? fontBold : font;
      const words = text.split(/\s+/);
      let line = "";
      const flush = () => {
        if (!line) return;
        newPageIfNeeded(lineHeight);
        drawText(line, x, y, size, bold);
        y -= lineHeight;
        line = "";
      };
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (activeFont.widthOfTextAtSize(test, size) > maxWidth) {
          flush();
          line = word;
        } else {
          line = test;
        }
      }
      flush();
      y -= spacingAfter;
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
    y -= 24;

    // Paper-contract binding paragraphs. These mirror page 1 of the
    // physical JSL commitment: policies + amendments are binding for
    // the full residency, utilities included, UA on entry, and the
    // service-not-lease disclosure. Keep the wording close to the
    // paper form so a resident signing here is bound to the same
    // language as one who signed on paper.
    drawParagraph(
      "All policies and procedures outlined within this contract and any applicable subsequent amendments are in full force and effect during Resident's entire residency at Jax Sober Living Halfway House (JSL) unless specifically defined within a subsection of this contract. Violation of any policy or procedure outlined within this contract and any applicable subsequent amendments will result in disciplinary actions including, but not limited to, fines, fees, House probation/restriction, and possible discharge."
    );
    drawParagraph(
      "Residents' portion of the premises shall include access to all common living areas, kitchen, laundry, and the like, and shared bedroom and bathroom. Monthly water, trash, electric, cable and internet utilities shall be included in sober living fee."
    );
    drawParagraph(
      "Upon entering JSL House resident will submit to urine analyst test and/or alcohol test."
    );
    drawParagraph(
      "Residents of the JSL House program are purchasing a service from JSL House that includes housing. Residents are not renting or leasing any particular apartment or room."
    );
    drawParagraph(
      `Resident shall commit to a ${commitmentTerm} stay at the property listed above, effective ${commitmentStartDate}.`
    );
    drawParagraph(
      `Resident will pay a ${cycleLower} Sober Living Fee for a portion of the premises located at: ${propertyLocation}. Resident initials: ${residentInitials || "________"}`
    );

    // Paper-contract intake summary. Mirrors the checkbox grid on
    // page 1 of the physical form: payment frequency selection,
    // admin-fee-paid-prior status, new-intake vs existing-tenant
    // activation, and any money collected at move-in with partial-
    // reason + restrictions carried over. Amendments skip this
    // block entirely — the fields describe the original intake and
    // the amendment PDF already has an old-vs-new terms panel.
    if (!isAmendment) {
    y -= 6;
    newPageIfNeeded(40);
    drawText("INTAKE SUMMARY:", 50, y, 12, true);
    y -= 18;

    const checkbox = (checked: boolean) => (checked ? "[X]" : "[ ]");
    drawParagraph(
      `Payment Frequency:   ${checkbox(isWeekly)} Weekly    ${checkbox(!isWeekly)} Monthly`,
      { spacingAfter: 2 }
    );
    drawParagraph(
      `Resident Type:       ${checkbox(!isExistingTenant)} New Intake    ${checkbox(isExistingTenant)} Existing Resident`,
      { spacingAfter: 2 }
    );
    drawParagraph(
      `Admin Fee ($${adminFee.toFixed(2)}):  ${checkbox(skipInitialAdminFee)} Paid Prior / Waived    ${checkbox(!skipInitialAdminFee)} Due at Move-In`,
      { spacingAfter: 6 }
    );

    if (!isExistingTenant) {
      newPageIfNeeded(40);
      drawText("MOVE-IN PAYMENT:", 50, y, 11, true);
      y -= 16;
      if (moveInSummary) {
        const adminApplied = moveInSummary.adminFeeApplied;
        const rentApplied = moveInSummary.rentApplied;
        const total = moveInSummary.totalCollected;
        const owed =
          (skipInitialAdminFee ? 0 : adminFee) + rentAmount;
        const outstanding = Math.max(0, owed - total);
        drawParagraph(
          `Collected: $${total.toFixed(2)} via ${moveInSummary.method} on ${moveInSummary.paidAt}`,
          { spacingAfter: 2 }
        );
        drawParagraph(
          `   Applied to Admin Fee: $${adminApplied.toFixed(2)}    Applied to Rent: $${rentApplied.toFixed(2)}`,
          { spacingAfter: 2 }
        );
        if (outstanding > 0) {
          drawParagraph(
            `Outstanding balance at move-in: $${outstanding.toFixed(2)} (partial payment)`,
            { spacingAfter: 2, bold: true }
          );
          if (moveInSummary.partialReason) {
            drawParagraph(
              `Partial-payment reason: ${moveInSummary.partialReason}`,
              { spacingAfter: 6 }
            );
          } else {
            y -= 4;
          }
        } else {
          drawParagraph("Paid in full at move-in.", { spacingAfter: 6 });
        }
      } else {
        drawParagraph("No payment collected at move-in.", {
          spacingAfter: 6,
        });
      }
    }

    if (restrictions.length > 0) {
      newPageIfNeeded(40);
      drawText("HOUSE RESTRICTIONS AT CHECK-IN:", 50, y, 11, true);
      y -= 16;
      for (const r of restrictions) {
        const suffix = r.end_date ? ` (through ${r.end_date})` : "";
        drawParagraph(`\u2022 ${r.restriction_type}: ${r.description}${suffix}`, {
          indent: 14,
          spacingAfter: 2,
        });
      }
      y -= 4;
    }
    } // end: if (!isAmendment)

    y -= 6;
    newPageIfNeeded(40);
    drawText("FINANCIAL & HOUSE TERMS:", 50, y, 12, true);
    y -= 18;

    drawParagraph(
      `1. RENT: The ${cycleLower} sober living fee is $${rentAmount.toFixed(2)}, due ${rentDueDate}. Rent is collected on the day before each ${cycleLower} cycle begins. Payment frequency: ${frequencyLabel}.`
    );
    drawParagraph(
      `2. ADMINISTRATIVE MOVE-IN FEE: A one-time, non-refundable administrative fee of $${adminFee.toFixed(2)} is due upon move-in. It is charged once at the start of the resident's tenancy and is never re-charged by a payment-terms amendment.`
    );
    drawParagraph(
      "3. EARLY MOVE-OUT: Resident must provide at least 48 hours written notice prior to early departure."
    );
    drawParagraph(
      "4. HOUSE RULES: Resident agrees to abide by all house rules, including but not limited to:",
      { spacingAfter: 2 }
    );
    for (const rule of [
      "Maintain sobriety at all times while on the premises",
      "Attend required house meetings and programs",
      "Complete assigned chores on schedule",
      "Respect quiet hours and other residents' privacy",
      "No overnight guests without prior approval",
      "Submit to random drug/alcohol testing",
    ]) {
      drawParagraph(`\u2022 ${rule}`, { indent: 14, spacingAfter: 2 });
    }
    y -= 4;
    drawParagraph(
      "5. VIOLATIONS: Any violation of house rules may result in demerits, fines, or discharge."
    );
    drawParagraph(
      "6. DISCHARGE: Management reserves the right to discharge any resident for rule violations, non-payment of fees, or behavior deemed harmful to the recovery community."
    );

    if (notes) {
      y -= 6;
      newPageIfNeeded(40);
      drawText("ADDITIONAL NOTES:", 50, y, 11, true);
      y -= 16;
      const noteLines = notes.split("\n");
      for (const line of noteLines) {
        drawText(line, 50, y, 9);
        y -= 14;
      }
    }

    // Keep the whole signature block on one page — splitting it
    // across pages would leave staff signature on page N and
    // resident signature on page N+1, which reads badly on printed
    // receipts.
    y -= 12;
    newPageIfNeeded(180);
    drawText("SIGNATURES:", 50, y, 12, true);
    y -= 25;

    // Staff signature
    drawText("Staff Signature:", 50, y, 10, true);
    if (staffSignature) {
      try {
        const sigBytes = Uint8Array.from(atob(staffSignature.split(",")[1] || ""), (c) => c.charCodeAt(0));
        const sigImage = await pdf.embedPng(sigBytes);
        currentPage.drawImage(sigImage, { x: 50, y: y - 55, width: 150, height: 40 });
      } catch {
        drawText("[Staff signature on file]", 50, y - 15, 9);
      }
    }
    drawText(
      `Date: ${staffSignedAt ? new Date(staffSignedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" }) : ""}`,
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
        currentPage.drawImage(sigImage, { x: 50, y: y - 55, width: 150, height: 40 });
      } catch {
        drawText("[Resident signature on file]", 50, y - 15, 9);
      }
    }
    drawText(`Date: ${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })}`, 250, y - 40, 9);

    const pdfBytes = await pdf.save();
    const bytes = new Uint8Array(pdfBytes);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }, [residentName, houseName, propertyLocation, rentAmount, adminFee, paymentFrequency, rentDueDate, commitmentStartDate, commitmentTerm, notes, staffSignature, staffSignedAt, residentSignature, residentInitials, cycleLower, frequencyLabel, isWeekly, skipInitialAdminFee, isExistingTenant, restrictions, moveInSummary]);

  function handleSubmit() {
    if (!residentInitials.trim()) {
      setError(
        "Please initial the property location before submitting"
      );
      return;
    }
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
      {/* Amendment banner — only shown when this is an edit to a
          previously signed commitment. Reason comes from the admin
          who drafted the amendment. */}
      {isAmendment && parentTerms && (
        <Card className="border-amber-400 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">
              Payment Terms Amendment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {amendmentReason && (
              <p className="text-amber-900">
                <span className="font-semibold">Reason:</span> {amendmentReason}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="p-3 rounded-lg bg-white border">
                <p className="text-xs text-muted-foreground">Previous Terms</p>
                <p className="font-medium">
                  Rent ${parentTerms.rent_amount.toFixed(2)}
                  {perCycle}
                </p>
                {parentTerms.admin_fee !== null && parentTerms.admin_fee > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Admin fee ${parentTerms.admin_fee.toFixed(2)} (one-time,
                    already collected)
                  </p>
                )}
              </div>
              <div className="p-3 rounded-lg bg-white border border-amber-300">
                <p className="text-xs text-muted-foreground">New Terms</p>
                <p className="font-medium">
                  Rent ${rentAmount.toFixed(2)}
                  {perCycle}
                </p>
                <p className="text-xs text-muted-foreground">
                  Admin fee not re-charged
                </p>
                <p className="text-xs text-muted-foreground">
                  Effective {formatDateOnly(commitmentStartDate)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
              <p className="font-medium">{formatDateOnly(commitmentStartDate)}</p>
              <p className="text-muted-foreground text-xs mt-1">Term: {commitmentTerm}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-muted-foreground text-xs">
                {frequencyLabel} Sober Living Fee
              </p>
              <p className="font-medium text-lg">${rentAmount.toFixed(2)}</p>
              <p className="text-muted-foreground text-xs mt-1">
                Due {rentDueDate} ({frequencyLabel})
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-muted-foreground text-xs">
                Administrative Move-In Fee
              </p>
              <p className="font-medium text-lg">${adminFee.toFixed(2)}</p>
              <p className="text-muted-foreground text-xs mt-1">
                One-time, non-refundable, due at move-in
              </p>
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

      {/* Intake Summary — mirrors the checkbox grid on page 1 of the
          paper contract: payment frequency, new-intake vs existing-
          tenant, admin-fee-paid-prior status, money collected at
          move-in (with partial-reason when applicable), and any
          restrictions placed on the resident at check-in. */}
      {!isAmendment && (
        <Card>
          <CardHeader>
            <CardTitle>Intake Summary</CardTitle>
            <p className="text-sm text-muted-foreground">
              Please confirm these match the terms you discussed with
              staff before signing.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Payment Frequency
                </p>
                <p>
                  <span aria-hidden className="font-mono">
                    {isWeekly ? "[X]" : "[ ]"}
                  </span>{" "}
                  Weekly
                </p>
                <p>
                  <span aria-hidden className="font-mono">
                    {!isWeekly ? "[X]" : "[ ]"}
                  </span>{" "}
                  Monthly
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Resident Type
                </p>
                <p>
                  <span aria-hidden className="font-mono">
                    {!isExistingTenant ? "[X]" : "[ ]"}
                  </span>{" "}
                  New Intake
                </p>
                <p>
                  <span aria-hidden className="font-mono">
                    {isExistingTenant ? "[X]" : "[ ]"}
                  </span>{" "}
                  Existing Resident
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Admin Fee (${adminFee.toFixed(2)})
                </p>
                <p>
                  <span aria-hidden className="font-mono">
                    {skipInitialAdminFee ? "[X]" : "[ ]"}
                  </span>{" "}
                  Paid Prior / Waived
                </p>
                <p>
                  <span aria-hidden className="font-mono">
                    {!skipInitialAdminFee ? "[X]" : "[ ]"}
                  </span>{" "}
                  Due at Move-In
                </p>
              </div>
            </div>

            {!isExistingTenant && (
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2 font-semibold">
                  Move-In Payment
                </p>
                {moveInSummary ? (
                  (() => {
                    const owed =
                      (skipInitialAdminFee ? 0 : adminFee) + rentAmount;
                    const outstanding = Math.max(
                      0,
                      owed - moveInSummary.totalCollected
                    );
                    const partial = outstanding > 0;
                    return (
                      <div className="space-y-1">
                        <p>
                          Collected:{" "}
                          <span className="font-medium">
                            ${moveInSummary.totalCollected.toFixed(2)}
                          </span>{" "}
                          via {moveInSummary.method} on{" "}
                          {moveInSummary.paidAt}
                        </p>
                        <p className="text-muted-foreground">
                          Applied to Admin Fee: $
                          {moveInSummary.adminFeeApplied.toFixed(2)}
                          {"    "}· Applied to Rent: $
                          {moveInSummary.rentApplied.toFixed(2)}
                        </p>
                        {partial ? (
                          <>
                            <p className="font-semibold text-amber-800">
                              Outstanding balance at move-in: $
                              {outstanding.toFixed(2)} (partial payment)
                            </p>
                            {moveInSummary.partialReason && (
                              <p className="text-muted-foreground">
                                Partial-payment reason:{" "}
                                {moveInSummary.partialReason}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-green-800">
                            Paid in full at move-in.
                          </p>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-muted-foreground">
                    No payment collected at move-in.
                  </p>
                )}
              </div>
            )}

            {restrictions.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2 font-semibold">
                  House Restrictions at Check-In
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {restrictions.map((r, i) => (
                    <li key={i}>
                      <span className="font-medium">{r.restriction_type}:</span>{" "}
                      {r.description}
                      {r.end_date && (
                        <span className="text-muted-foreground">
                          {" "}
                          (through {r.end_date})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Terms — prose block mirrors page 1 of the paper JSL
          commitment agreement (binding-policies paragraph, premises
          scope + utilities included, UA on entry, service-not-lease
          disclosure, commitment term, property location). The
          financial + house-rules numbered list that follows is the
          same content as before; it's preserved so the on-screen
          terms match what gets baked into the generated PDF. */}
      <Card>
        <CardHeader>
          <CardTitle>Terms and Conditions</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none space-y-4 text-sm">
          <p>
            All policies and procedures outlined within this contract and any
            applicable subsequent amendments are in full force and effect
            during Resident&apos;s entire residency at Jax Sober Living
            Halfway House (JSL) unless specifically defined within a
            subsection of this contract. Violation of any policy or procedure
            outlined within this contract and any applicable subsequent
            amendments will result in disciplinary actions including, but
            not limited to, fines, fees, House probation/restriction, and
            possible discharge.
          </p>
          <p>
            Residents&apos; portion of the premises shall include access to
            all common living areas, kitchen, laundry, and the like, and
            shared bedroom and bathroom. Monthly water, trash, electric,
            cable and internet utilities shall be included in sober living
            fee.
          </p>
          <p>
            Upon entering JSL House resident will submit to urine analyst
            test and/or alcohol test.
          </p>
          <p>
            Residents of the JSL House program are purchasing a service
            from JSL House that includes housing. Residents are not renting
            or leasing any particular apartment or room.
          </p>
          <p>
            Resident shall commit to a <strong>{commitmentTerm}</strong> stay
            at the property listed above, effective{" "}
            <strong>{formatDateOnly(commitmentStartDate)}</strong>.
          </p>
          <p>
            Resident will pay a {cycleLower} Sober Living Fee for a portion
            of the premises located at:{" "}
            <strong>{propertyLocation}</strong>.
          </p>

          <hr className="my-2" />

          <h3 className="text-sm font-semibold">Financial &amp; House Terms</h3>
          <ol className="space-y-2 text-sm">
            <li>
              <strong>RENT:</strong> The {cycleLower} sober living fee is $
              {rentAmount.toFixed(2)}, due {rentDueDate}. Rent is collected
              on the day before each {cycleLower} cycle begins. Payment
              frequency: {frequencyLabel}.
            </li>
            <li>
              <strong>ADMINISTRATIVE MOVE-IN FEE:</strong> A one-time,
              non-refundable administrative fee of ${adminFee.toFixed(2)} is
              due upon move-in. It is charged once at the start of tenancy
              and is never re-charged by a payment-terms amendment.
            </li>
            <li>
              <strong>EARLY MOVE-OUT:</strong> Resident must provide at
              least 48 hours written notice prior to early departure.
            </li>
            <li>
              <strong>HOUSE RULES:</strong> Resident agrees to abide by all
              house rules, including but not limited to:
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
              <strong>VIOLATIONS:</strong> Any violation of house rules may
              result in demerits, fines, or discharge.
            </li>
            <li>
              <strong>DISCHARGE:</strong> Management reserves the right to
              discharge any resident for rule violations, non-payment of
              fees, or behavior deemed harmful to the recovery community.
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Property-location initials — paper contract requires the
          resident to initial the address on page 1 (separate from
          the full signature at the end). Required before submit. */}
      <Card>
        <CardHeader>
          <CardTitle>Initial Your Property Location</CardTitle>
          <p className="text-sm text-muted-foreground">
            Type your initials to confirm you understand and agree to live
            at <strong>{propertyLocation}</strong>.
          </p>
        </CardHeader>
        <CardContent>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            maxLength={8}
            placeholder="e.g. CS"
            value={residentInitials}
            onChange={(e) =>
              setResidentInitials(e.target.value.toUpperCase())
            }
            className="w-32 rounded-md border border-input bg-background px-3 py-2 text-center text-lg font-semibold tracking-widest uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Resident initials"
          />
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
                Signed on {staffSignedAt ? new Date(staffSignedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" }) : "—"}
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
              disabled={
                isPending || !residentSignature || !residentInitials.trim()
              }
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
