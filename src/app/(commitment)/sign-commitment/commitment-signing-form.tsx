"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/signature-pad";
import { signCommitment } from "./actions";
import { formatDateOnly } from "@/lib/timezone";

// Canonical addresses printed on the paper JSL commitment. The
// three properties are baked into the contract itself (each one
// gets an initial blank on page 1). When a resident signs, their
// typed initials auto-fill ONLY the row whose address matches the
// commitment's assigned property; the other two rows stay blank.
// Order and exact punctuation mirror the paper form verbatim.
const CANONICAL_ADDRESSES = [
  "4368 Chelsy Harbour Drive, Jacksonville, FL 32224",
  "2129 Indian Springs Drive, Jacksonville , FL 32246",
  "2123 Indian Springs Drive, Jacksonville, 32246",
] as const;

// Loose-match a commitment's stored `property_location` / house
// address against the three canonical printed addresses. We compare
// street number + street name only — commas, city, zip vary between
// the paper form and what staff type into `houses.address`, but the
// leading "4368 Chelsy" / "2129 Indian Springs" / "2123 Indian
// Springs" is unique and stable.
function matchCanonicalAddress(assigned: string | null | undefined): string | null {
  if (!assigned) return null;
  const norm = assigned.toLowerCase().replace(/\s+/g, " ").trim();
  for (const addr of CANONICAL_ADDRESSES) {
    const head = addr.split(",")[0]?.toLowerCase() ?? "";
    if (head && norm.includes(head)) return addr;
  }
  return null;
}

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
  // a small old-vs-new banner above the contract body so the
  // resident sees what changed before re-signing.
  amendmentReason?: string | null;
  parentTerms?: {
    rent_amount: number;
    admin_fee: number | null;
    commitment_start_date: string;
  } | null;
  // Retained for API compatibility with page.tsx; no longer rendered
  // in the contract body (the paper JSL form doesn't include these).
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
  commitmentStartDate,
  staffSignature,
  staffSignedAt,
  amendmentReason,
  parentTerms,
}: CommitmentSigningFormProps) {
  const isAmendment = Boolean(parentTerms);
  const isWeekly = paymentFrequency?.toLowerCase() === "weekly";
  const perCycle = isWeekly ? "/wk" : "/mo";

  // Page-2 rate clause needs the day-of-month (monthly) or weekday
  // name (weekly) derived from commitment_start_date. We also render
  // a long-form "commencing …" date so the printed contract reads
  // naturally. commitmentStartDate is an ISO date (YYYY-MM-DD) in
  // house time; parse manually to avoid UTC drift.
  const [csYear, csMonth, csDay] = (commitmentStartDate || "")
    .split("-")
    .map((n) => Number(n));
  const startDateObj =
    Number.isFinite(csYear) && Number.isFinite(csMonth) && Number.isFinite(csDay)
      ? new Date(csYear, (csMonth ?? 1) - 1, csDay ?? 1)
      : null;
  // Rent is always due the day BEFORE the cycle anchor (see
  // computeRentDueDate in src/lib/payments/charges.ts). The paper
  // contract's rate clause therefore references the due weekday /
  // due day-of-month, NOT the anchor itself.
  const dueDateObj = startDateObj
    ? (() => {
        const d = new Date(startDateObj);
        d.setDate(d.getDate() - 1);
        return d;
      })()
    : null;
  const dueWeekdayName = dueDateObj
    ? dueDateObj.toLocaleDateString("en-US", { weekday: "long" })
    : "the day before the anchor weekday";
  const dayOfMonth = startDateObj ? startDateObj.getDate() : null;
  const ordinalize = (n: number) => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    const mod10 = n % 10;
    if (mod10 === 1) return `${n}st`;
    if (mod10 === 2) return `${n}nd`;
    if (mod10 === 3) return `${n}rd`;
    return `${n}th`;
  };
  // Human phrase for the monthly due day. Anchor 1 → "last day of
  // the preceding month" (variable-length, so no trailing "of each
  // month" here). Every other anchor N → "the (N-1)th day of each
  // month". Phrase is the complete clause — consumers must NOT append
  // additional suffix text.
  const monthlyDueDayPhrase =
    dayOfMonth == null
      ? "the agreed day of each month"
      : dayOfMonth === 1
        ? "the last day of each preceding month"
        : `the ${ordinalize(dayOfMonth - 1)} day of each month`;
  const startDateLong = startDateObj
    ? startDateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : commitmentStartDate;

  // Which of the three canonical addresses does this commitment map
  // to? The initial auto-fills next to that row and leaves the other
  // two blank — mirroring how a resident initials the paper form.
  const selectedAddress = useMemo(
    () => matchCanonicalAddress(propertyLocation) ?? matchCanonicalAddress(houseName),
    [propertyLocation, houseName]
  );

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [residentSignature, setResidentSignature] = useState<string | null>(null);
  const [residentInitials, setResidentInitials] = useState("");
  const initialStamp = residentInitials.trim() || "";

  const generatePdf = useCallback(async (): Promise<string> => {
    const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const fontItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

    // US Letter at 612x792. Leave generous inner margins to match
    // the scanned paper form's layout (~60pt left/right, wide
    // vertical breathing room).
    const pageWidth = 612;
    const pageHeight = 792;
    const marginX = 60;
    const maxWidth = pageWidth - marginX * 2;

    // Draw bottom-right "INITIAL" label with a short underline
    // above the resident's typed initials. Appears on every page
    // of the generated PDF exactly as it appears on the paper form.
    const drawInitialStamp = (page: Awaited<ReturnType<typeof pdf.addPage>>) => {
      const rightX = pageWidth - marginX - 80;
      const baseY = 45;
      page.drawLine({
        start: { x: rightX, y: baseY + 16 },
        end: { x: rightX + 70, y: baseY + 16 },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
      if (initialStamp) {
        page.drawText(initialStamp, {
          x: rightX + 5,
          y: baseY + 20,
          size: 11,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }
      page.drawText("INITIAL", {
        x: rightX + 20,
        y: baseY + 4,
        size: 8,
        font,
        color: rgb(0.25, 0.25, 0.25),
      });
    };

    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - 60;

    const drawCenteredText = (
      text: string,
      yPos: number,
      size: number,
      useFont: typeof font = font
    ) => {
      const width = useFont.widthOfTextAtSize(text, size);
      const x = (pageWidth - width) / 2;
      page.drawText(text, { x, y: yPos, size, font: useFont, color: rgb(0, 0, 0) });
    };

    const drawParagraph = (
      text: string,
      opts?: { size?: number; bold?: boolean; italic?: boolean; indent?: number; spacingAfter?: number; lineHeight?: number }
    ) => {
      const size = opts?.size ?? 11;
      const bold = opts?.bold ?? false;
      const italic = opts?.italic ?? false;
      const indent = opts?.indent ?? 0;
      const spacingAfter = opts?.spacingAfter ?? 8;
      const lineHeight = opts?.lineHeight ?? size + 4;
      const x = marginX + indent;
      const width = maxWidth - indent;
      const activeFont = italic ? fontItalic : bold ? fontBold : font;
      const words = text.split(/\s+/);
      let line = "";
      const flush = () => {
        if (!line) return;
        page.drawText(line, {
          x,
          y,
          size,
          font: activeFont,
          color: rgb(0, 0, 0),
        });
        y -= lineHeight;
        line = "";
      };
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (activeFont.widthOfTextAtSize(test, size) > width) {
          flush();
          line = word;
        } else {
          line = test;
        }
      }
      flush();
      y -= spacingAfter;
    };

    // ============ PAGE 1 ============
    // Title block — mirrors the scanned paper contract.
    drawCenteredText("Jax Sober Living House", y, 18, fontItalic);
    y -= 28;
    drawCenteredText("HOUSE COMMITMENT AGREEMENT", y, 16, fontBold);
    y -= 40;

    drawParagraph(
      "All policies and procedures outlined within this contract and any applicable subsequent amendments are in full force and effect during Resident's entire residency at Jax Sober Living House unless specifically defined within a subsection of this contract. Violation of any policy or procedure outlined within this contract and any applicable subsequent amendments will result in disciplinary actions including, but not limited to, fines, fees, House probation/restriction, and possible discharge."
    );
    drawParagraph(
      "Residents' portion of the premises shall include access to all common living areas, kitchen, laundry, and the like, and shared bedroom and bathroom. Monthly water, trash, electric, cable and internet utilities shall be included in sober living fee."
    );
    drawParagraph(
      "Upon entering Jax Sober Living House resident will submit to urine analyst test and/or alcohol test."
    );
    drawParagraph(
      "Residents of the Jax Sober Living House program are purchasing a service from Jax Sober Living House that includes housing. Residents are not renting or leasing any particular apartment or room."
    );

    // Resident-name blank + binding clause. Paper form leaves a
    // long underline for the name; we pre-fill the resident's name
    // on the PDF so it's unambiguous who is signing.
    y -= 4;
    {
      const size = 11;
      const nameLineWidth = 320;
      page.drawLine({
        start: { x: marginX, y: y - 2 },
        end: { x: marginX + nameLineWidth, y: y - 2 },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
      page.drawText(residentName, {
        x: marginX + 4,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
      // Trailing binding language continues on the next line.
      page.drawText("(Hereinafter referred to as \"Resident\") and James", {
        x: marginX + nameLineWidth + 4,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
      y -= 16;
    }
    drawParagraph(
      "Kerr (hereinafter referred to as \"Executive Director\") enter into this agreement as follows: Resident shall commit to a one hundred-eighty-one (181) days stay as indicated below: (Resident will initial below)",
      { spacingAfter: 14 }
    );

    // 181-day stay initial line. Blank underline on the left, then
    // "one hundred-eighty-one (181) day stay" to its right.
    {
      const size = 11;
      const initBlankWidth = 80;
      page.drawLine({
        start: { x: marginX, y: y - 2 },
        end: { x: marginX + initBlankWidth, y: y - 2 },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
      if (initialStamp) {
        page.drawText(initialStamp, {
          x: marginX + 10,
          y,
          size,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }
      page.drawText("one hundred-eighty-one (181) day stay", {
        x: marginX + initBlankWidth + 8,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
      y -= 28;
    }

    drawParagraph(
      "Resident will pay a month to month Sober Living Fee for a portion of the premises located at: (Resident will initial location below)",
      { spacingAfter: 12 }
    );

    // Three canonical addresses. Initials auto-fill only on the
    // selected address row; others stay blank. Row spacing mirrors
    // the paper form's vertical rhythm.
    for (const addr of CANONICAL_ADDRESSES) {
      const size = 11;
      const initBlankWidth = 80;
      page.drawLine({
        start: { x: marginX, y: y - 2 },
        end: { x: marginX + initBlankWidth, y: y - 2 },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
      if (initialStamp && addr === selectedAddress) {
        page.drawText(initialStamp, {
          x: marginX + 10,
          y,
          size,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }
      page.drawText(addr, {
        x: marginX + initBlankWidth + 8,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
      y -= 22;
    }

    drawInitialStamp(page);

    // ============ PAGE 2 ============
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - 60;

    page.drawText("Page 1 of 2 (continued)", {
      x: marginX,
      y,
      size: 10,
      font: fontItalic,
      color: rgb(0, 0, 0),
    });
    y -= 32;

    // Rate clause: the ONE authorized variant point in the whole
    // contract. Switches on the commitment's payment_frequency.
    // Monthly uses the paper form's exact template (rate + day-of-
    // month + commencing date). Weekly mirrors the same structure,
    // reading weekday + commencing date.
    if (isWeekly) {
      drawParagraph(
        `Sober Living Fee shall be at the weekly rate of $${rentAmount.toFixed(
          2
        )} per week, payable every ${dueWeekdayName}, commencing ${startDateLong}.`
      );
    } else {
      drawParagraph(
        `Sober Living Fee shall be at the monthly rate of $${rentAmount.toFixed(
          2
        )} per month, payable on ${monthlyDueDayPhrase}, commencing ${startDateLong}.`
      );
    }

    y -= 6;
    drawParagraph(
      `Sober Living Administrative Fee (nonrefundable) shall be $${adminFee.toFixed(
        2
      )}, payable to James Kerr upon entering Jax Sober Living.`
    );

    y -= 6;
    drawParagraph("TERMINATION OF RESIDENCY", { bold: true, spacingAfter: 6 });
    for (const [i, item] of [
      "A 30-day written notice is required prior to terminating services.",
      "This must be done at the beginning of the 6th month or the beginning of any month after 6 month commitment is completed.",
      "Upon leaving, Resident's bedroom should be thoroughly cleaned.",
    ].entries()) {
      drawParagraph(`${i + 1}. ${item}`, { indent: 20, spacingAfter: 4 });
    }

    y -= 6;
    drawParagraph("EARLY MOVE-OUT", { bold: true, spacingAfter: 6 });
    drawParagraph(
      "1. Leaving prior to the end of the 6 month commitment require a 48 hours' notice and no refunds will be issued.",
      { indent: 20 }
    );

    y -= 10;
    drawParagraph(
      "Signing below indicates that I agree to the terms listed above and have received a copy of this agreement.",
      { bold: true, spacingAfter: 16 }
    );

    // Resident signature row.
    const signatureRow = (
      label: string,
      sigDataUrl: string | null,
      dateLabel: string
    ) => {
      const rowY = y;
      const labelWidth = 110;
      page.drawText(`${label}:`, {
        x: marginX,
        y: rowY,
        size: 11,
        font,
        color: rgb(0, 0, 0),
      });
      const sigLineX0 = marginX + labelWidth;
      const sigLineX1 = marginX + 340;
      page.drawLine({
        start: { x: sigLineX0, y: rowY - 2 },
        end: { x: sigLineX1, y: rowY - 2 },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
      page.drawText("Date:", {
        x: sigLineX1 + 16,
        y: rowY,
        size: 11,
        font,
        color: rgb(0, 0, 0),
      });
      const dateLineX0 = sigLineX1 + 50;
      const dateLineX1 = pageWidth - marginX;
      page.drawLine({
        start: { x: dateLineX0, y: rowY - 2 },
        end: { x: dateLineX1, y: rowY - 2 },
        thickness: 0.6,
        color: rgb(0, 0, 0),
      });
      if (dateLabel) {
        page.drawText(dateLabel, {
          x: dateLineX0 + 4,
          y: rowY,
          size: 11,
          font,
          color: rgb(0, 0, 0),
        });
      }
      return { sigLineX0, sigLineY: rowY - 2 };
    };

    const today = new Date().toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
    const staffDate = staffSignedAt
      ? new Date(staffSignedAt).toLocaleDateString("en-US", {
          timeZone: "America/New_York",
          month: "numeric",
          day: "numeric",
          year: "numeric",
        })
      : "";

    const residentRow = signatureRow("Resident's signature", residentSignature, today);
    if (residentSignature) {
      try {
        const sigBytes = Uint8Array.from(
          atob(residentSignature.split(",")[1] || ""),
          (c) => c.charCodeAt(0)
        );
        const sigImage = await pdf.embedPng(sigBytes);
        page.drawImage(sigImage, {
          x: residentRow.sigLineX0 + 4,
          y: residentRow.sigLineY,
          width: 200,
          height: 30,
        });
      } catch {
        // Fall back silently — signature line stays blank if decode
        // fails. Server action will reject a submit without a real
        // signature anyway.
      }
    }
    y -= 40;

    const staffRow = signatureRow("Staff's signature", staffSignature, staffDate);
    if (staffSignature) {
      try {
        const sigBytes = Uint8Array.from(
          atob(staffSignature.split(",")[1] || ""),
          (c) => c.charCodeAt(0)
        );
        const sigImage = await pdf.embedPng(sigBytes);
        page.drawImage(sigImage, {
          x: staffRow.sigLineX0 + 4,
          y: staffRow.sigLineY,
          width: 200,
          height: 30,
        });
      } catch {
        // No-op.
      }
    }

    drawInitialStamp(page);

    const pdfBytes = await pdf.save();
    const bytes = new Uint8Array(pdfBytes);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }, [
    residentName,
    rentAmount,
    adminFee,
    isWeekly,
    dueWeekdayName,
    monthlyDueDayPhrase,
    startDateLong,
    staffSignature,
    staffSignedAt,
    residentSignature,
    initialStamp,
    selectedAddress,
  ]);

  function handleSubmit() {
    if (!residentInitials.trim()) {
      setError("Please type your initials before submitting");
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

  // ---------------- On-screen rendering ----------------
  // The signing form mirrors the two-page paper JSL commitment
  // verbatim: every paragraph, line break, numbered clause, and
  // initial/signature position matches the scanned form. The only
  // content that varies between residents is the rate clause on
  // page 2 (weekly vs monthly) — driven off payment_frequency.

  const todayLabel = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
  });
  const staffSignedLabel = staffSignedAt
    ? new Date(staffSignedAt).toLocaleDateString("en-US", {
        timeZone: "America/New_York",
      })
    : "";

  return (
    <div className="space-y-6">
      {/* Amendment banner — shown only when this is a payment-terms
          update to a previously signed commitment. The contract
          body below still mirrors the paper form; the banner makes
          the old-vs-new delta obvious before re-signing. */}
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

      {/* Page 1 — mirrors the scanned JSL commitment exactly. */}
      <Card>
        <CardContent className="space-y-5 px-8 py-10 font-serif text-[15px] leading-relaxed text-black">
          <div className="text-center">
            <p className="italic text-2xl">Jax Sober Living House</p>
            <p className="mt-4 text-xl font-bold uppercase tracking-wide">
              House Commitment Agreement
            </p>
          </div>

          <p className="pt-4">
            All policies and procedures outlined within this contract and any
            applicable subsequent amendments are in full force and effect
            during Resident&apos;s entire residency at{" "}
            <span className="italic font-semibold">Jax Sober Living House</span>{" "}
            unless specifically defined within a subsection of this contract.
            Violation of any policy or procedure outlined within this contract
            and any applicable subsequent amendments will result in
            disciplinary actions including, but not limited to, fines, fees,
            House probation/restriction, and possible discharge.
          </p>

          <p>
            Residents&apos; portion of the premises shall include access to
            all common living areas, kitchen, laundry, and the like, and
            shared bedroom and bathroom. Monthly water, trash, electric, cable
            and internet utilities shall be included in sober living fee.
          </p>

          <p>
            Upon entering{" "}
            <span className="italic font-semibold">Jax Sober Living House</span>{" "}
            resident will submit to urine analyst test and/or alcohol test.
          </p>

          <p>
            Residents of the{" "}
            <span className="italic font-semibold">Jax Sober Living House</span>{" "}
            program are purchasing a service from{" "}
            <span className="italic font-semibold">Jax Sober Living House</span>{" "}
            that includes housing. Residents are not renting or leasing any
            particular apartment or room.
          </p>

          <p className="pt-2">
            <span className="inline-block border-b border-black px-2 min-w-[320px] font-semibold">
              {residentName}
            </span>{" "}
            (Hereinafter referred to as &ldquo;Resident&rdquo;) and James Kerr
            (hereinafter referred to as &ldquo;Executive Director&rdquo;) enter
            into this agreement as follows: Resident shall commit to a one
            hundred-eighty-one (181) days stay as indicated below: (Resident
            will initial below)
          </p>

          {/* 181-day stay initial row. */}
          <div className="flex items-center gap-3 pl-2 pt-2">
            <span className="inline-block border-b border-black min-w-[80px] text-center font-semibold">
              {initialStamp || "\u00A0"}
            </span>
            <span>one hundred-eighty-one (181) day stay</span>
          </div>

          <p className="pt-3">
            Resident will pay a month to month Sober Living Fee for a portion
            of the premises located at: (Resident will initial location below)
          </p>

          {/* Address initial rows. Only the row that matches the
              commitment's assigned property receives an initial
              when the resident types theirs in; other rows stay
              blank, exactly like the paper form. */}
          <div className="space-y-3 pl-2">
            {CANONICAL_ADDRESSES.map((addr) => {
              const selected = addr === selectedAddress;
              return (
                <div key={addr} className="flex items-center gap-3">
                  <span
                    className={`inline-block border-b border-black min-w-[80px] text-center font-semibold ${
                      selected ? "" : "text-transparent"
                    }`}
                  >
                    {selected && initialStamp ? initialStamp : "\u00A0"}
                  </span>
                  <span>{addr}</span>
                </div>
              );
            })}
          </div>

          {/* Bottom-right INITIAL stamp, matching the paper page
              footer. The underline holds the typed initials. */}
          <div className="flex justify-end pt-6">
            <div className="w-28 text-center">
              <span className="block border-b border-black font-semibold">
                {initialStamp || "\u00A0"}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                Initial
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Page 2 — matches the paper form's continuation page. */}
      <Card>
        <CardContent className="space-y-5 px-8 py-10 font-serif text-[15px] leading-relaxed text-black">
          <p className="italic text-sm text-neutral-700">
            Page 1 of 2 (continued)
          </p>

          <p>
            {isWeekly ? (
              <>
                Sober Living Fee shall be at the weekly rate of{" "}
                <span className="font-semibold">
                  ${rentAmount.toFixed(2)}
                </span>{" "}
                per week, payable every{" "}
                <span className="font-semibold">{dueWeekdayName}</span>,
                commencing{" "}
                <span className="font-semibold">{startDateLong}</span>.
              </>
            ) : (
              <>
                Sober Living Fee shall be at the monthly rate of{" "}
                <span className="font-semibold">
                  ${rentAmount.toFixed(2)}
                </span>{" "}
                per month, payable on{" "}
                <span className="font-semibold">{monthlyDueDayPhrase}</span>,
                commencing{" "}
                <span className="font-semibold">{startDateLong}</span>.
              </>
            )}
          </p>

          <p>
            Sober Living Administrative Fee (nonrefundable) shall be{" "}
            <span className="font-semibold">${adminFee.toFixed(2)}</span>,
            payable to James Kerr upon entering Jax Sober Living.
          </p>

          <div className="space-y-2 pt-2">
            <p className="font-bold uppercase tracking-wide">
              Termination of Residency
            </p>
            <ol className="list-decimal space-y-1 pl-8">
              <li>A 30-day written notice is required prior to terminating services.</li>
              <li>
                This must be done at the beginning of the 6th month or the
                beginning of any month after 6 month commitment is completed.
              </li>
              <li>Upon leaving, Resident&apos;s bedroom should be thoroughly cleaned.</li>
            </ol>
          </div>

          <div className="space-y-2 pt-2">
            <p className="font-bold uppercase tracking-wide">Early Move-Out</p>
            <ol className="list-decimal space-y-1 pl-8">
              <li>
                Leaving prior to the end of the 6 month commitment require a
                48 hours&apos; notice and no refunds will be issued.
              </li>
            </ol>
          </div>

          <p className="pt-4 font-semibold">
            Signing below indicates that I agree to the terms listed above and
            have received a copy of this agreement.
          </p>

          {/* Signature rows — resident above staff, date to the
              right of each signature, matching the paper form. */}
          <div className="space-y-6 pt-4">
            <div className="flex items-end gap-3">
              <span className="shrink-0">Resident&apos;s signature:</span>
              <div className="flex-1 border-b border-black min-h-[32px] relative">
                {residentSignature && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={residentSignature}
                    alt="Resident signature"
                    className="absolute bottom-0 left-1 h-8 w-auto"
                  />
                )}
              </div>
              <span className="shrink-0">Date:</span>
              <span className="shrink-0 min-w-[120px] border-b border-black text-center">
                {todayLabel}
              </span>
            </div>

            <div className="flex items-end gap-3">
              <span className="shrink-0">Staff&apos;s signature:</span>
              <div className="flex-1 border-b border-black min-h-[32px] relative">
                {staffSignature && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={staffSignature}
                    alt="Staff signature"
                    className="absolute bottom-0 left-1 h-8 w-auto"
                  />
                )}
              </div>
              <span className="shrink-0">Date:</span>
              <span className="shrink-0 min-w-[120px] border-b border-black text-center">
                {staffSignedLabel}
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-8">
            <div className="w-28 text-center">
              <span className="block border-b border-black font-semibold">
                {initialStamp || "\u00A0"}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                Initial
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resident-input card — collects initials + signature that
          flow back into the contract body above AND into the
          generated PDF. Single initial applies to: the 181-day
          stay row, the matched-address row, and the bottom-right
          INITIAL stamp on both pages. */}
      <Card>
        <CardHeader>
          <CardTitle>Initial &amp; Sign</CardTitle>
          <p className="text-sm text-muted-foreground">
            Type your initials and sign below to complete the agreement.
            Your initials will be applied to the 181-day stay line, your
            assigned address, and the bottom of each page.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label
              htmlFor="resident-initials"
              className="text-sm font-medium block mb-2"
            >
              Your Initials
            </label>
            <input
              id="resident-initials"
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
            {!selectedAddress && (
              <p className="mt-2 text-xs text-amber-700">
                Note: your assigned address didn&apos;t match any of the three
                printed addresses on the contract. Please alert staff before
                signing.
              </p>
            )}
          </div>

          <SignaturePad
            onSignatureChange={setResidentSignature}
            label="Resident Signature"
          />

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

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
