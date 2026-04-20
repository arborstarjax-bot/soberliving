"use client";

import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import {
  ALL_POLICIES,
  APPLICATION_ATTEST_TEXT,
  DOCUMENT_RECEIPT_TEXT,
  ROI_INTRO_TEXT,
  type PolicyPageContent,
} from "./policy-text";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const LINE_HEIGHT = 14;
const FONT_SIZE = 10;
const TITLE_SIZE = 15;
const SECTION_SIZE = 11;
const LABEL_SIZE = 8;

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
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  let currentPage: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPage() {
    currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 30) {
      newPage();
    }
  }

  function drawTitle(text: string) {
    ensureSpace(TITLE_SIZE + 20);
    currentPage.drawText(text, {
      x: MARGIN,
      y,
      size: TITLE_SIZE,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= TITLE_SIZE + 10;
  }

  function drawSectionHeading(text: string) {
    ensureSpace(SECTION_SIZE + 12);
    currentPage.drawText(text, {
      x: MARGIN,
      y,
      size: SECTION_SIZE,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= SECTION_SIZE + 6;
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

  function drawParagraph(text: string, opts?: { bold?: boolean; size?: number; indent?: number }) {
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

  function drawField(label: string, value: string | undefined) {
    ensureSpace(LINE_HEIGHT * 2);
    currentPage.drawText(label.toUpperCase(), {
      x: MARGIN,
      y,
      size: LABEL_SIZE,
      font: boldFont,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 11;
    currentPage.drawText(value || "—", {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT + 2;
  }

  function drawFieldRow(fields: { label: string; value: string | undefined }[]) {
    ensureSpace(LINE_HEIGHT * 2);
    const colWidth = (PAGE_WIDTH - 2 * MARGIN) / fields.length;
    for (let i = 0; i < fields.length; i++) {
      const x = MARGIN + i * colWidth;
      currentPage.drawText(fields[i].label.toUpperCase(), {
        x,
        y,
        size: LABEL_SIZE,
        font: boldFont,
        color: rgb(0.35, 0.35, 0.35),
      });
      currentPage.drawText(fields[i].value || "—", {
        x,
        y: y - 11,
        size: FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
    }
    y -= LINE_HEIGHT * 2;
  }

  function drawLongAnswer(label: string, value: string | undefined) {
    ensureSpace(LINE_HEIGHT * 3);
    currentPage.drawText(label.toUpperCase(), {
      x: MARGIN,
      y,
      size: LABEL_SIZE,
      font: boldFont,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 11;
    if (!value) {
      currentPage.drawText("—", { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
      y -= LINE_HEIGHT + 2;
      return;
    }
    const lines = wrapText(value, font, FONT_SIZE, PAGE_WIDTH - 2 * MARGIN);
    for (const line of lines) {
      ensureSpace(LINE_HEIGHT);
      currentPage.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
      y -= LINE_HEIGHT;
    }
    y -= 4;
  }

  async function drawSignatureBlock(opts: {
    label: string;
    signatureKey: string;
    dateValue?: string;
    printedName?: { label: string; value: string };
  }) {
    ensureSpace(95);
    currentPage.drawText(opts.label.toUpperCase(), {
      x: MARGIN,
      y,
      size: LABEL_SIZE,
      font: boldFont,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 12;

    const sigData = signatures[opts.signatureKey];
    if (sigData) {
      try {
        const sigBytes = await fetch(sigData).then((r) => r.arrayBuffer());
        const sigImage = await pdf.embedPng(new Uint8Array(sigBytes));
        const drawWidth = 220;
        const drawHeight = (sigImage.height / sigImage.width) * drawWidth;
        currentPage.drawImage(sigImage, {
          x: MARGIN,
          y: y - drawHeight,
          width: drawWidth,
          height: drawHeight,
        });
        y -= drawHeight + 4;
      } catch {
        currentPage.drawText("[Signature on file]", {
          x: MARGIN,
          y,
          size: FONT_SIZE,
          font,
          color: rgb(0.4, 0.4, 0.4),
        });
        y -= LINE_HEIGHT;
      }
    } else {
      currentPage.drawText("—", { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0.4, 0.4, 0.4) });
      y -= LINE_HEIGHT;
    }

    // Draw signature underline
    currentPage.drawLine({
      start: { x: MARGIN, y: y + 2 },
      end: { x: MARGIN + 260, y: y + 2 },
      thickness: 0.5,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 4;

    const info: { label: string; value: string | undefined }[] = [];
    if (opts.printedName) {
      info.push({ label: opts.printedName.label, value: opts.printedName.value });
    }
    if (opts.dateValue !== undefined) {
      info.push({ label: "Date", value: opts.dateValue });
    }
    if (info.length > 0) {
      drawFieldRow(info);
    }
    y -= 6;
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
  drawField("Gender", formData.gender);
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
  drawField("Do you own a vehicle?", formData.owns_vehicle);
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
  drawLongAnswer("How did you hear about Jax Sober Living?", formData.referral_source);
  drawField(
    "Do you identify as someone who struggles with drugs and/or alcohol?",
    formData.struggles_with_substances
  );
  drawField(
    "Plan on working a recovery program while at Jax Sober Living (12 Step based)?",
    formData.in_recovery_program
  );
  drawField("Attending or will be attending an IOP Program?", formData.attending_iop);
  if (formData.attending_iop === "Yes") {
    drawField("IOP Program Name", formData.iop_program_name);
  }
  drawLongAnswer("Medications", formData.medications);
  drawLongAnswer("Medical History / Issues", formData.medical_history);
  drawField("Ever been diagnosed with a mental illness?", formData.has_mental_illness);
  if (formData.has_mental_illness === "Yes") {
    drawLongAnswer("Mental Illness Diagnosis", formData.mental_illness_diagnosis);
  }
  drawField("Any present or past physical problems?", formData.has_physical_problems);
  if (formData.has_physical_problems === "Yes") {
    drawLongAnswer("Physical Problem Diagnosis", formData.physical_problems_diagnosis);
  }

  // — Allergies / Physician / Employment —
  newPage();
  drawSectionHeading("Allergies, Physician & Employment");
  drawField("Any known allergies?", formData.has_allergies);
  if (formData.has_allergies === "Yes") {
    drawLongAnswer("Allergy Description (reaction / remedy)", formData.allergies_details);
  }
  drawField("Currently under the care of a physician?", formData.under_physician_care);
  if (formData.under_physician_care === "Yes") {
    drawLongAnswer("Reason", formData.physician_reason);
    drawFieldRow([
      { label: "Physician's Name", value: formData.physician_name },
      { label: "Phone No.", value: formData.physician_phone },
    ]);
  }
  drawField("Currently working?", formData.currently_working);
  if (formData.currently_working === "Yes") {
    drawField("Employer", formData.employer_name);
    drawField("Employer Address", formData.employer_address);
    drawField("Employer Phone", formData.employer_phone);
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
    drawField("Successfully completed?", completed);
    if (completed === "No" && reason) {
      drawLongAnswer("If no, why not?", reason);
    }
  }
  drawField("Sobriety Date", formData.sobriety_date);

  // — Drug Use & Criminal History —
  newPage();
  drawSectionHeading("Drug Use");
  drawField("Drug of Choice", formData.drug_of_choice);
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
  drawField("Ever convicted of a felony or misdemeanor?", formData.convicted_felon);
  if (formData.convicted_felon === "Yes") {
    drawLongAnswer("Explanation", formData.conviction_explanation);
  }
  drawField("Sex Offender / Predator Status?", formData.sex_offender);
  if (formData.sex_offender === "Yes") {
    drawLongAnswer("Explanation", formData.sex_offender_explanation);
  }
  drawField(
    "Convicted of violent/sexual crimes against elderly, children, or disabled?",
    formData.violent_crime_history
  );
  if (formData.violent_crime_history === "Yes") {
    drawLongAnswer("Explanation", formData.violent_crime_explanation);
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
    pages[i].drawText(`Page ${i + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 80,
      y: 20,
      size: 8,
      font,
      color: rgb(0.55, 0.55, 0.55),
    });
    pages[i].drawText(
      `Generated ${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })} — Jax Sober Living`,
      {
        x: MARGIN,
        y: 20,
        size: 8,
        font,
        color: rgb(0.55, 0.55, 0.55),
      }
    );
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

  async function renderPolicy(policy: PolicyPageContent, formData: Record<string, string>) {
    newPage();
    drawTitle(policy.title);
    y -= 4;
    for (const section of policy.sections) {
      if (section.heading) {
        drawSectionHeading(section.heading);
      }
      for (const para of section.body.split("\n\n")) {
        drawParagraph(para);
        y -= 4;
      }
      y -= 4;
    }
    y -= 6;
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
