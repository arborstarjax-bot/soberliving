"use client";

import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import {
  ALL_POLICIES,
  APPLICATION_ATTEST_TEXT,
  DOCUMENT_RECEIPT_TEXT,
  ROI_INTRO_TEXT,
  type PolicyPageContent,
} from "./policy-text";

// Geometry chosen to mirror the paper JSL Resident Application scan:
// an inset decorative border, italic Times titles wrapped in en-dashes,
// and inline form rows with underlined placeholders/values.
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_BORDER_INSET = 28;
const MARGIN = 54;
const LINE_HEIGHT = 14;
const FONT_SIZE = 10;
const TITLE_SIZE = 18;
const SECTION_SIZE = 11;
const UNDERLINE_COLOR = rgb(0, 0, 0);

export interface StaffSignOff {
  signature: string; // data URL of the signature image
  printedName: string;
  date: string; // ISO yyyy-mm-dd
}

export async function generateIntakePdf(
  rawFormData: Record<string, string>,
  rawSignatures: Record<string, string>,
  staffSignOff?: StaffSignOff | null
): Promise<string> {
  // When staff has signed off, one signature+name+date fills every
  // staff/witness slot across the packet (application staff sig,
  // every policy's witness sig, ROI witness sig). If no sign-off
  // yet, these slots render blank so the PDF still reflects the
  // current state of the packet.
  const formData: Record<string, string> = { ...rawFormData };
  const signatures: Record<string, string> = { ...rawSignatures };
  if (staffSignOff) {
    formData.application_staff_name = staffSignOff.printedName;
    formData.application_staff_date = staffSignOff.date;
    signatures.application_staff = staffSignOff.signature;
    for (const p of ALL_POLICIES) {
      if (p.witnessKey) {
        signatures[p.witnessKey] = staffSignOff.signature;
        formData[`${p.witnessKey}_date`] = staffSignOff.date;
      }
    }
    signatures.release_of_information_witness = staffSignOff.signature;
    formData.roi_witness_printed_name = staffSignOff.printedName;
    formData.roi_witness_date = staffSignOff.date;
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italicFont = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const boldItalicFont = await pdf.embedFont(
    StandardFonts.TimesRomanBoldItalic
  );

  function drawPageBorder(page: PDFPage) {
    page.drawRectangle({
      x: PAGE_BORDER_INSET,
      y: PAGE_BORDER_INSET,
      width: PAGE_WIDTH - 2 * PAGE_BORDER_INSET,
      height: PAGE_HEIGHT - 2 * PAGE_BORDER_INSET,
      borderWidth: 0.75,
      borderColor: rgb(0, 0, 0),
    });
  }

  let currentPage: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageBorder(currentPage);
  let y = PAGE_HEIGHT - MARGIN;

  function newPage() {
    currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageBorder(currentPage);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 30) {
      newPage();
    }
  }

  // Centered italic title wrapped in en-dashes, mirroring the paper scan:
  //     - Jax Sober Living Resident Application -
  function drawTitle(text: string) {
    ensureSpace(TITLE_SIZE + 28);
    const full = `- ${text} -`;
    const width = boldItalicFont.widthOfTextAtSize(full, TITLE_SIZE);
    const x = (PAGE_WIDTH - width) / 2;
    currentPage.drawText(full, {
      x,
      y,
      size: TITLE_SIZE,
      font: boldItalicFont,
      color: rgb(0, 0, 0),
    });
    y -= TITLE_SIZE + 14;
  }

  function drawSectionHeading(text: string) {
    ensureSpace(SECTION_SIZE + 10);
    currentPage.drawText(text, {
      x: MARGIN,
      y,
      size: SECTION_SIZE,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= SECTION_SIZE + 4;
  }

  function wrapText(text: string, fontToUse: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const rawLine of text.split("\n")) {
      if (!rawLine) {
        lines.push("");
        continue;
      }
      const words = rawLine.split(" ");
      let cur = "";
      for (const w of words) {
        const candidate = cur ? `${cur} ${w}` : w;
        if (fontToUse.widthOfTextAtSize(candidate, size) > maxWidth) {
          if (cur) lines.push(cur);
          cur = w;
        } else {
          cur = candidate;
        }
      }
      if (cur) lines.push(cur);
    }
    return lines;
  }

  function drawParagraph(
    text: string,
    opts?: { bold?: boolean; size?: number; indent?: number }
  ) {
    const useFont = opts?.bold ? boldFont : font;
    const size = opts?.size ?? FONT_SIZE;
    const indent = opts?.indent ?? 0;
    const maxWidth = PAGE_WIDTH - 2 * MARGIN - indent;
    const lines = wrapText(text, useFont, size, maxWidth);
    for (const line of lines) {
      ensureSpace(LINE_HEIGHT);
      currentPage.drawText(line, {
        x: MARGIN + indent,
        y,
        size,
        font: useFont,
        color: rgb(0, 0, 0),
      });
      y -= LINE_HEIGHT;
    }
  }

  // Paragraph renderer that understands the policy-text bullet and numbered
  // list conventions. Lines beginning with "\u2022" or "N." keep their marker
  // and wrap to a hanging indent so continuations align under the body, not
  // under the marker.
  function drawPolicyBody(text: string) {
    for (const rawPara of text.split("\n\n")) {
      const lines = rawPara.split("\n");
      for (const rawLine of lines) {
        const line = rawLine.trimStart();
        const bulletMatch = line.match(/^(\u2022|\d+\.)\s+(.*)$/);
        if (bulletMatch) {
          const marker = bulletMatch[1];
          const rest = bulletMatch[2];
          const markerIndent = 14;
          const bodyIndent = 28;
          const wrapped = wrapText(
            rest,
            font,
            FONT_SIZE,
            PAGE_WIDTH - 2 * MARGIN - bodyIndent
          );
          ensureSpace(LINE_HEIGHT * wrapped.length);
          currentPage.drawText(marker, {
            x: MARGIN + markerIndent,
            y,
            size: FONT_SIZE,
            font,
            color: rgb(0, 0, 0),
          });
          for (let i = 0; i < wrapped.length; i++) {
            currentPage.drawText(wrapped[i], {
              x: MARGIN + bodyIndent,
              y,
              size: FONT_SIZE,
              font,
              color: rgb(0, 0, 0),
            });
            y -= LINE_HEIGHT;
          }
        } else if (line.length > 0) {
          drawParagraph(line);
        }
      }
      y -= 6;
    }
  }

  // Inline field row: "Label: ____value____" segments on a single line.
  // Each segment takes a share of the row width based on its `flex`. Empty
  // values render as a blank underline, matching the paper form.
  function drawInlineRow(
    fields: { label: string; value?: string; flex?: number }[]
  ) {
    ensureSpace(LINE_HEIGHT + 4);
    const totalFlex = fields.reduce((sum, f) => sum + (f.flex ?? 1), 0);
    const available = PAGE_WIDTH - 2 * MARGIN;
    let cursorX = MARGIN;
    for (const f of fields) {
      const slotWidth = (available * (f.flex ?? 1)) / totalFlex;
      const labelText = `${f.label}: `;
      const labelWidth = font.widthOfTextAtSize(labelText, FONT_SIZE);
      const underlineStart = cursorX + labelWidth;
      const underlineEnd = cursorX + slotWidth - 6;
      currentPage.drawText(labelText, {
        x: cursorX,
        y,
        size: FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
      currentPage.drawLine({
        start: { x: underlineStart, y: y - 1 },
        end: { x: underlineEnd, y: y - 1 },
        thickness: 0.4,
        color: UNDERLINE_COLOR,
      });
      if (f.value && f.value.trim().length > 0) {
        currentPage.drawText(f.value, {
          x: underlineStart + 2,
          y: y + 1,
          size: FONT_SIZE,
          font,
          color: rgb(0, 0, 0),
        });
      }
      cursorX += slotWidth;
    }
    y -= LINE_HEIGHT + 4;
  }

  // Label followed by a single underlined value that stretches to the right
  // margin. Used for address lines, sobriety date, etc.
  function drawInlineField(label: string, value: string | undefined) {
    drawInlineRow([{ label, value }]);
  }

  // "Do you X? ... ... Yes or No" with the selected option bolded +
  // underlined. Yes/No column is right-aligned to the content margin
  // so every question's options land in the same column, matching the
  // paper scan's alignment. Long questions wrap onto multiple lines.
  function drawYesNoField(question: string, value: string | undefined) {
    const selected = (value ?? "").toLowerCase();
    const yesChosen = selected === "yes" || selected === "y";
    const noChosen = selected === "no" || selected === "n";
    const yesFont = yesChosen ? boldFont : font;
    const noFont = noChosen ? boldFont : font;
    const orWidth = font.widthOfTextAtSize(" or ", FONT_SIZE);
    const yesWidth = yesFont.widthOfTextAtSize("Yes", FONT_SIZE);
    const noWidth = noFont.widthOfTextAtSize("No", FONT_SIZE);
    const optionsWidth = yesWidth + orWidth + noWidth;
    const optionsX = PAGE_WIDTH - MARGIN - optionsWidth;
    // Leave a 12pt gutter between the wrapped question text and the
    // right-aligned options column.
    const questionMaxWidth = optionsX - MARGIN - 12;
    const lines = wrapText(question, font, FONT_SIZE, questionMaxWidth);
    ensureSpace(LINE_HEIGHT * lines.length + 4);
    for (let i = 0; i < lines.length; i++) {
      currentPage.drawText(lines[i], {
        x: MARGIN,
        y,
        size: FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
      if (i < lines.length - 1) y -= LINE_HEIGHT;
    }
    // Options column sits on the baseline of the last question line.
    let cursorX = optionsX;
    const drawOption = (opt: string, chosen: boolean, f: PDFFont, w: number) => {
      currentPage.drawText(opt, {
        x: cursorX,
        y,
        size: FONT_SIZE,
        font: f,
        color: rgb(0, 0, 0),
      });
      if (chosen) {
        currentPage.drawLine({
          start: { x: cursorX, y: y - 1 },
          end: { x: cursorX + w, y: y - 1 },
          thickness: 0.6,
          color: rgb(0, 0, 0),
        });
      }
      cursorX += w;
    };
    drawOption("Yes", yesChosen, yesFont, yesWidth);
    currentPage.drawText(" or ", {
      x: cursorX,
      y,
      size: FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
    });
    cursorX += orWidth;
    drawOption("No", noChosen, noFont, noWidth);
    y -= LINE_HEIGHT + 4;
  }

  // Gender row: shows all options with the selected one bold+underlined.
  function drawGenderField(value: string | undefined) {
    ensureSpace(LINE_HEIGHT + 4);
    const selected = (value ?? "").toLowerCase();
    const prefix = "Gender:  ";
    currentPage.drawText(prefix, {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
    });
    let cursorX = MARGIN + font.widthOfTextAtSize(prefix, FONT_SIZE);
    const options: Array<{ label: string; match: string[] }> = [
      { label: "M", match: ["m", "male"] },
      { label: "F", match: ["f", "female"] },
      { label: "Trans", match: ["trans", "transgender"] },
      { label: "Non-Binary", match: ["non-binary", "nonbinary", "nb"] },
    ];
    for (const opt of options) {
      const chosen = opt.match.includes(selected);
      const f = chosen ? boldFont : font;
      currentPage.drawText(opt.label, {
        x: cursorX,
        y,
        size: FONT_SIZE,
        font: f,
        color: rgb(0, 0, 0),
      });
      const w = f.widthOfTextAtSize(opt.label, FONT_SIZE);
      if (chosen) {
        currentPage.drawLine({
          start: { x: cursorX, y: y - 1 },
          end: { x: cursorX + w, y: y - 1 },
          thickness: 0.6,
          color: rgb(0, 0, 0),
        });
      }
      cursorX += w + 24;
    }
    y -= LINE_HEIGHT + 4;
  }

  // Italic "Policy:" / "Procedure:" label followed by the body text on the
  // same line (body wraps under the label in the scan).
  function drawPolicyLead(label: string, body: string) {
    const labelText = `${label}: `;
    const labelWidth = boldFont.widthOfTextAtSize(labelText, FONT_SIZE);
    const firstLineWidth = PAGE_WIDTH - 2 * MARGIN - labelWidth;
    // split first line by words so it fits after the bold prefix
    const words = body.split(/\s+/);
    let first = "";
    let rest = "";
    for (let i = 0; i < words.length; i++) {
      const cand = first ? `${first} ${words[i]}` : words[i];
      if (font.widthOfTextAtSize(cand, FONT_SIZE) > firstLineWidth) {
        rest = words.slice(i).join(" ");
        break;
      }
      first = cand;
    }
    ensureSpace(LINE_HEIGHT);
    currentPage.drawText(labelText, {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    currentPage.drawText(first, {
      x: MARGIN + labelWidth,
      y,
      size: FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;
    if (rest) {
      drawParagraph(rest);
    }
    y -= 4;
  }

  // Backwards-compatible wrappers that delegate to the paper-style inline
  // helpers so existing call sites don't change layout unexpectedly.
  function drawField(label: string, value: string | undefined) {
    drawInlineField(label, value);
  }

  function drawFieldRow(fields: { label: string; value: string | undefined }[]) {
    drawInlineRow(fields);
  }

  // Paper-style signature row:
  //   Resident Signature: ______[image]_______    Date: _______
  //   Printed Name:       _____________________
  // The signature image sits ON the underline (its bottom = the line),
  // so the faint rule reads like a real signature line instead of an
  // unrelated stripe below the image.
  async function drawSignatureBlock(opts: {
    label: string;
    signatureKey: string;
    dateValue?: string;
    printedName?: { label: string; value: string };
  }) {
    // Reserve space for sig row + (optional) printed-name row.
    const SIG_IMAGE_MAX_HEIGHT = 28;
    const rowHeight = SIG_IMAGE_MAX_HEIGHT + LINE_HEIGHT;
    const hasPrintedName = !!opts.printedName;
    ensureSpace(rowHeight + (hasPrintedName ? LINE_HEIGHT + 4 : 0) + 6);

    const hasDate = opts.dateValue !== undefined;
    const dateLabelText = "Date: ";
    const dateLabelWidth = font.widthOfTextAtSize(dateLabelText, FONT_SIZE);
    const dateSlotWidth = hasDate ? 90 : 0;
    const dateColumnWidth = hasDate ? dateLabelWidth + dateSlotWidth : 0;

    const labelText = `${opts.label}: `;
    const labelWidth = font.widthOfTextAtSize(labelText, FONT_SIZE);
    const sigLineStart = MARGIN + labelWidth;
    const sigLineEnd =
      PAGE_WIDTH - MARGIN - (hasDate ? dateColumnWidth + 18 : 0);
    const sigLineY = y - SIG_IMAGE_MAX_HEIGHT;

    currentPage.drawText(labelText, {
      x: MARGIN,
      y: sigLineY + 2,
      size: FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
    });
    currentPage.drawLine({
      start: { x: sigLineStart, y: sigLineY },
      end: { x: sigLineEnd, y: sigLineY },
      thickness: 0.4,
      color: rgb(0, 0, 0),
    });

    const sigData = signatures[opts.signatureKey];
    if (sigData) {
      try {
        const sigBytes = await fetch(sigData).then((r) => r.arrayBuffer());
        const sigImage = await pdf.embedPng(new Uint8Array(sigBytes));
        const availableWidth = sigLineEnd - sigLineStart - 4;
        const aspectWidth = (sigImage.width / sigImage.height) * SIG_IMAGE_MAX_HEIGHT;
        const drawWidth = Math.min(aspectWidth, availableWidth);
        const drawHeight = (sigImage.height / sigImage.width) * drawWidth;
        // Center the signature vertically around the line: bottom of the
        // image sits right on the rule.
        currentPage.drawImage(sigImage, {
          x: sigLineStart + 2,
          y: sigLineY,
          width: drawWidth,
          height: drawHeight,
        });
      } catch {
        currentPage.drawText("[signature on file]", {
          x: sigLineStart + 4,
          y: sigLineY + 2,
          size: FONT_SIZE,
          font,
          color: rgb(0.4, 0.4, 0.4),
        });
      }
    }

    if (hasDate) {
      const dateX = PAGE_WIDTH - MARGIN - dateColumnWidth;
      currentPage.drawText(dateLabelText, {
        x: dateX,
        y: sigLineY + 2,
        size: FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
      currentPage.drawLine({
        start: { x: dateX + dateLabelWidth, y: sigLineY },
        end: { x: PAGE_WIDTH - MARGIN, y: sigLineY },
        thickness: 0.4,
        color: rgb(0, 0, 0),
      });
      if (opts.dateValue && opts.dateValue.trim().length > 0) {
        currentPage.drawText(opts.dateValue, {
          x: dateX + dateLabelWidth + 2,
          y: sigLineY + 2,
          size: FONT_SIZE,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }

    y = sigLineY - 6;

    if (hasPrintedName) {
      drawInlineField(opts.printedName!.label, opts.printedName!.value);
    }
    y -= 2;
  }

  // ═══════════════════════════════════════════════════════════════
  // RESIDENT APPLICATION
  // ═══════════════════════════════════════════════════════════════

  drawTitle("Jax Sober Living Resident Application");
  y -= 4;

  // — Personal Info —
  drawFieldRow([
    { label: "First Name", value: formData.first_name },
    { label: "Middle Name", value: formData.middle_name },
    { label: "Last Name", value: formData.last_name },
  ]);
  drawFieldRow([
    { label: "Admission Date", value: formData.admission_date },
    { label: "Date of Birth", value: formData.date_of_birth },
  ]);
  drawGenderField(formData.gender);
  drawFieldRow([
    { label: "Phone No.", value: formData.phone },
    { label: "Email Address", value: formData.email },
  ]);
  drawField("Home Address", formData.home_address);
  drawFieldRow([
    { label: "City", value: formData.city },
    { label: "State", value: formData.state },
    { label: "Zip", value: formData.zip },
  ]);

  // — Vehicle —
  drawSectionHeading("Vehicle");
  drawYesNoField("Do you own a vehicle?", formData.owns_vehicle);
  if (formData.owns_vehicle === "Yes") {
    drawFieldRow([
      { label: "Year", value: formData.vehicle_year },
      { label: "Make", value: formData.vehicle_make },
      { label: "Model", value: formData.vehicle_model },
      { label: "Color", value: formData.vehicle_color },
    ]);
    drawFieldRow([
      { label: "Plate State", value: formData.license_plate_state },
      { label: "Plate Number", value: formData.license_plate_number },
      { label: "Plate Exp (mo/yr)", value: formData.license_plate_expiration },
    ]);
    drawFieldRow([
      { label: "Insurance Co.", value: formData.insurance_company },
      { label: "Policy #", value: formData.insurance_policy_number },
      { label: "Insurance Exp.", value: formData.insurance_expiration_date },
    ]);
  }

  // — Referral & Recovery —
  drawSectionHeading("Recovery & Medical");
  drawInlineField(
    "How did you hear about Jax Sober Living?",
    formData.referral_source
  );
  drawYesNoField(
    "Do you identify as someone who struggles with drugs and/or alcohol?",
    formData.struggles_with_substances
  );
  drawYesNoField(
    "Plan on working a recovery program while at Jax Sober Living (12 Step based)?",
    formData.in_recovery_program
  );
  drawYesNoField(
    "Attending or will be attending an IOP Program?",
    formData.attending_iop
  );
  if (formData.attending_iop === "Yes") {
    drawInlineField("IOP Program Name", formData.iop_program_name);
  }
  drawInlineField("Medications", formData.medications);
  drawInlineField("Medical History / Issues", formData.medical_history);
  drawYesNoField(
    "Ever been diagnosed with a mental illness?",
    formData.has_mental_illness
  );
  if (formData.has_mental_illness === "Yes") {
    drawInlineField(
      "Mental Illness Diagnosis",
      formData.mental_illness_diagnosis
    );
  }
  drawYesNoField(
    "Any present or past physical problems?",
    formData.has_physical_problems
  );
  if (formData.has_physical_problems === "Yes") {
    drawInlineField(
      "Physical Problem Diagnosis",
      formData.physical_problems_diagnosis
    );
  }

  // — Allergies / Physician / Employment —
  newPage();
  drawSectionHeading("Allergies, Physician & Employment");
  drawYesNoField("Any known allergies?", formData.has_allergies);
  if (formData.has_allergies === "Yes") {
    drawInlineField(
      "If yes, describe (reaction / remedy)",
      formData.allergies_details
    );
  }
  drawYesNoField(
    "Currently under the care of a physician?",
    formData.under_physician_care
  );
  if (formData.under_physician_care === "Yes") {
    drawInlineField("If so, reason", formData.physician_reason);
    drawInlineRow([
      { label: "Physician's Name", value: formData.physician_name },
      { label: "Phone No.", value: formData.physician_phone },
    ]);
  }
  drawYesNoField("Currently working?", formData.currently_working);
  if (formData.currently_working === "Yes") {
    drawInlineField("Employer", formData.employer_name);
    drawInlineField("Employer Address", formData.employer_address);
    drawInlineField("Employer Phone", formData.employer_phone);
  }

  // — Emergency + Financial Contacts —
  drawSectionHeading("Emergency Contacts");
  drawFieldRow([
    { label: "Name", value: formData.emergency_contact_1_name },
    { label: "Relationship", value: formData.emergency_contact_1_relationship },
    { label: "Phone No.", value: formData.emergency_contact_1_phone },
  ]);
  drawFieldRow([
    { label: "Name", value: formData.emergency_contact_2_name },
    { label: "Relationship", value: formData.emergency_contact_2_relationship },
    { label: "Phone No.", value: formData.emergency_contact_2_phone },
  ]);
  drawSectionHeading("Financial Contact");
  drawFieldRow([
    { label: "Name", value: formData.financial_contact_name },
    { label: "Relationship", value: formData.financial_contact_relationship },
    { label: "Phone No.", value: formData.financial_contact_phone },
  ]);

  // — Substance Abuse Facility History —
  drawSectionHeading("Substance Abuse Facility / Sober Housing History");
  for (let i = 1; i <= 4; i++) {
    const name = formData[`facility_${i}_name`];
    const discharge = formData[`facility_${i}_discharge_date`];
    const length = formData[`facility_${i}_length_of_stay`];
    const completed = formData[`facility_${i}_completed`];
    const reason = formData[`facility_${i}_reason_not_completed`];
    if (!name && !discharge && !length && !completed) continue;
    drawFieldRow([
      { label: `Facility #${i}`, value: name },
      { label: "Date Discharged", value: discharge },
      { label: "Length of Stay", value: length },
    ]);
    drawYesNoField("Successfully completed?", completed);
    if (completed === "No" && reason) {
      drawInlineField("If no, why not?", reason);
    }
  }
  drawInlineField("Sobriety Date", formData.sobriety_date);

  // — Drug Use & Criminal History —
  newPage();
  drawSectionHeading("Drug Use");
  drawInlineField("Drug of Choice", formData.drug_of_choice);
  for (let i = 1; i <= 4; i++) {
    const d = formData[`recent_drug_${i}_name`];
    const dt = formData[`recent_drug_${i}_date`];
    if (!d && !dt) continue;
    drawFieldRow([
      { label: `Drug ${i}`, value: d },
      { label: "Date of Last Use", value: dt },
    ]);
  }

  drawSectionHeading("Criminal History");
  drawYesNoField(
    "Ever convicted of a felony or misdemeanor?",
    formData.convicted_felon
  );
  if (formData.convicted_felon === "Yes") {
    drawInlineField("If yes, please explain", formData.conviction_explanation);
  }
  drawYesNoField(
    "Sex Offender / Predator Status?",
    formData.sex_offender
  );
  if (formData.sex_offender === "Yes") {
    drawInlineField(
      "If yes, please explain",
      formData.sex_offender_explanation
    );
  }
  drawYesNoField(
    "Convicted of violent/sexual crimes against elderly, children, or disabled?",
    formData.violent_crime_history
  );
  if (formData.violent_crime_history === "Yes") {
    drawInlineField(
      "If yes, please explain",
      formData.violent_crime_explanation
    );
  }

  // — Attestation + Application signatures —
  drawSectionHeading("Attestation");
  drawParagraph(APPLICATION_ATTEST_TEXT);
  y -= 8;
  await drawSignatureBlock({
    label: "Resident Signature",
    signatureKey: "resident_application",
    dateValue: formData.application_resident_date,
    printedName: {
      label: "Printed Name",
      value: formData.application_resident_print_name,
    },
  });
  await drawSignatureBlock({
    label: "Staff Signature",
    signatureKey: "application_staff",
    dateValue: formData.application_staff_date,
    printedName: {
      label: "Staff Name",
      value: formData.application_staff_name,
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // POLICY PAGES (each on a fresh page)
  // ═══════════════════════════════════════════════════════════════

  for (const policy of ALL_POLICIES) {
    await renderPolicy(policy, formData);
  }

  // ═══════════════════════════════════════════════════════════════
  // RELEASE OF INFORMATION
  // ═══════════════════════════════════════════════════════════════

  newPage();
  drawTitle("Release of Information (ROI) — Emergency Contact");
  drawFieldRow([
    { label: "Resident's Name", value: formData.roi_resident_name },
    { label: "Date", value: formData.roi_form_date },
  ]);
  y -= 4;
  for (const para of ROI_INTRO_TEXT.split("\n\n")) {
    drawParagraph(para);
    y -= 4;
  }

  drawSectionHeading("Authorized Contacts");
  for (let i = 1; i <= 6; i++) {
    const name = formData[`roi_contact_${i}_name`];
    const rel = formData[`roi_contact_${i}_relationship`];
    const phone = formData[`roi_contact_${i}_phone`];
    if (!name && !rel && !phone) continue;
    drawFieldRow([
      { label: `Name #${i}`, value: name },
      { label: "Relationship", value: rel },
      { label: "Phone No.", value: phone },
    ]);
  }

  y -= 6;
  await drawSignatureBlock({
    label: "Resident Signature",
    signatureKey: "release_of_information",
    dateValue: formData.roi_resident_date,
    printedName: { label: "Printed Name", value: formData.roi_resident_printed_name },
  });
  await drawSignatureBlock({
    label: "Witness Signature",
    signatureKey: "release_of_information_witness",
    dateValue: formData.roi_witness_date,
    printedName: { label: "Printed Name", value: formData.roi_witness_printed_name },
  });

  // ═══════════════════════════════════════════════════════════════
  // RESIDENT DOCUMENT RECEIPT ACKNOWLEDGMENT
  // ═══════════════════════════════════════════════════════════════

  newPage();
  drawTitle("Resident Document Receipt Acknowledgment");
  drawParagraph(
    "Form letter to be signed by resident to indicate he or she has received the policy and procedures documents and understands its effect. To be returned to Jax Sober Living Halfway House."
  );
  y -= 4;
  const filledReceipt = DOCUMENT_RECEIPT_TEXT.replace(
    "____________________",
    formData.document_receipt_print_name || "____________________"
  );
  drawParagraph(filledReceipt);
  y -= 8;
  drawField("Print Name", formData.document_receipt_print_name);
  await drawSignatureBlock({
    label: "Resident Signature",
    signatureKey: "document_receipt",
    dateValue: formData.document_receipt_date,
  });

  // ───────────────────────────────────────────────────────────────
  // Footer on every page
  // ───────────────────────────────────────────────────────────────

  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    const footerText = `${i + 1} | P a g e`;
    const fw = italicFont.widthOfTextAtSize(footerText, 9);
    pages[i].drawText(footerText, {
      x: PAGE_WIDTH - PAGE_BORDER_INSET - 12 - fw,
      y: PAGE_BORDER_INSET + 10,
      size: 9,
      font: italicFont,
      color: rgb(0, 0, 0),
    });
  }

  const pdfBytes = await pdf.save();
  let binary = "";
  const bytes = new Uint8Array(pdfBytes);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);

  // ────────────────────────────────────────────────────────────────
  // helpers that close over `pdf` / `drawXYZ`
  // ────────────────────────────────────────────────────────────────

  // On the paper scan, policy pages use inline bold "Policy:" /
  // "Procedure:" prefixes for the first line of each section, and any
  // bullet or numbered items retain their markers on a hanging indent.
  // Other section headings (e.g. "Items not approved include...") print
  // as a standalone bold line above the body.
  async function renderPolicy(
    policy: PolicyPageContent,
    formData: Record<string, string>
  ) {
    newPage();
    drawTitle(policy.title);
    y -= 2;
    const LEAD_HEADINGS = new Set(["Policy", "Procedure"]);
    for (const section of policy.sections) {
      if (section.heading && LEAD_HEADINGS.has(section.heading)) {
        const [firstPara, ...restParas] = section.body.split("\n\n");
        drawPolicyLead(section.heading, firstPara);
        if (restParas.length > 0) {
          drawPolicyBody(restParas.join("\n\n"));
        }
      } else {
        if (section.heading) drawSectionHeading(section.heading);
        drawPolicyBody(section.body);
      }
      y -= 4;
    }
    y -= 4;
    await drawSignatureBlock({
      label: "Resident Signature",
      signatureKey: policy.signatureKey,
      dateValue: formData[`${policy.signatureKey}_date`],
    });
    if (policy.witnessKey) {
      await drawSignatureBlock({
        label: policy.witnessLabel ?? "Witness Signature",
        signatureKey: policy.witnessKey,
        dateValue: formData[`${policy.witnessKey}_date`],
      });
    }
  }
}
