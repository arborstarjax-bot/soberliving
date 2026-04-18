"use client";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const LINE_HEIGHT = 18;
const FONT_SIZE = 11;
const TITLE_SIZE = 16;
const LABEL_SIZE = 9;

export async function generateIntakePdf(
  formData: Record<string, string>,
  signatures: Record<string, string>
): Promise<string> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  let currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawTitle(text: string) {
    ensureSpace(40);
    currentPage.drawText(text, {
      x: MARGIN,
      y,
      size: TITLE_SIZE,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= TITLE_SIZE + 12;
  }

  function drawField(label: string, value: string | undefined) {
    ensureSpace(LINE_HEIGHT * 2);
    currentPage.drawText(label, {
      x: MARGIN,
      y,
      size: LABEL_SIZE,
      font: boldFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 14;
    currentPage.drawText(value || "—", {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;
  }

  function drawFieldRow(fields: { label: string; value: string | undefined }[]) {
    ensureSpace(LINE_HEIGHT * 2);
    const colWidth = (PAGE_WIDTH - 2 * MARGIN) / fields.length;
    for (let i = 0; i < fields.length; i++) {
      const x = MARGIN + i * colWidth;
      currentPage.drawText(fields[i].label, {
        x,
        y,
        size: LABEL_SIZE,
        font: boldFont,
        color: rgb(0.4, 0.4, 0.4),
      });
      currentPage.drawText(fields[i].value || "—", {
        x,
        y: y - 14,
        size: FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
    }
    y -= LINE_HEIGHT + 14;
  }

  function drawBullets(items: string[]) {
    for (const item of items) {
      ensureSpace(LINE_HEIGHT);
      const text = `• ${item}`;
      // Wrap long text
      const words = text.split(" ");
      let line = "";
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, FONT_SIZE);
        if (width > PAGE_WIDTH - 2 * MARGIN - 10) {
          ensureSpace(LINE_HEIGHT);
          currentPage.drawText(line, {
            x: MARGIN + 10,
            y,
            size: FONT_SIZE,
            font,
            color: rgb(0, 0, 0),
          });
          y -= LINE_HEIGHT;
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) {
        ensureSpace(LINE_HEIGHT);
        currentPage.drawText(line, {
          x: MARGIN + 10,
          y,
          size: FONT_SIZE,
          font,
          color: rgb(0, 0, 0),
        });
        y -= LINE_HEIGHT;
      }
    }
  }

  async function drawSignature(signatureKey: string, dateValue: string | undefined) {
    const sigData = signatures[signatureKey];
    if (sigData) {
      ensureSpace(80);
      try {
        const sigBytes = await fetch(sigData).then((r) => r.arrayBuffer());
        const sigImage = await pdf.embedPng(new Uint8Array(sigBytes));
        const sigDims = sigImage.scale(0.3);
        const drawWidth = Math.min(sigDims.width, 200);
        const drawHeight = (sigDims.height / sigDims.width) * drawWidth;
        currentPage.drawImage(sigImage, {
          x: MARGIN,
          y: y - drawHeight,
          width: drawWidth,
          height: drawHeight,
        });
        y -= drawHeight + 5;
      } catch {
        currentPage.drawText("[Signature on file]", {
          x: MARGIN,
          y,
          size: FONT_SIZE,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= LINE_HEIGHT;
      }
    }
    if (dateValue) {
      currentPage.drawText(`Date: ${dateValue}`, {
        x: MARGIN,
        y,
        size: FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
      y -= LINE_HEIGHT;
    }
    y -= 10;
  }

  // ─── Page 1: Resident Application ───────────────────────────
  drawTitle("Jax Sober Living Resident Application");
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
    { label: "Phone", value: formData.phone },
    { label: "Email", value: formData.email },
  ]);
  drawField("Home Address", formData.home_address);
  drawFieldRow([
    { label: "City", value: formData.city },
    { label: "State", value: formData.state },
    { label: "Zip", value: formData.zip },
  ]);
  drawField("Owns Vehicle", formData.owns_vehicle);
  if (formData.owns_vehicle === "Yes") {
    drawField("Vehicle Info", formData.vehicle_info);
    drawFieldRow([
      { label: "License Plate", value: formData.license_plate },
      { label: "Insurance", value: formData.insurance_info },
    ]);
  }

  // ─── Page 2: Recovery & Medical ─────────────────────────────
  currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  y = PAGE_HEIGHT - MARGIN;
  drawTitle("Recovery & Medical Information");
  drawField("How did you hear about Jax Sober Living?", formData.referral_source);
  drawField("Struggles with drugs/alcohol", formData.struggles_with_substances);
  drawField("Participating in recovery program", formData.in_recovery_program);
  drawField("Attending IOP", formData.attending_iop);
  if (formData.attending_iop === "Yes") {
    drawField("Program Name", formData.iop_program_name);
  }
  drawField("Medications", formData.medications);
  drawField("Medical History / Issues", formData.medical_history);
  drawField("Mental Illness Diagnosis", formData.mental_illness);
  drawField("Physical Health Issues", formData.physical_health);

  // ─── Page 3: Emergency & Financial Contacts ─────────────────
  currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  y = PAGE_HEIGHT - MARGIN;
  drawTitle("Emergency & Financial Contacts");
  drawField("Emergency Contact 1 — Name", formData.emergency_contact_1_name);
  drawFieldRow([
    { label: "Relationship", value: formData.emergency_contact_1_relationship },
    { label: "Phone", value: formData.emergency_contact_1_phone },
  ]);
  drawField("Emergency Contact 2 — Name", formData.emergency_contact_2_name);
  drawFieldRow([
    { label: "Relationship", value: formData.emergency_contact_2_relationship },
    { label: "Phone", value: formData.emergency_contact_2_phone },
  ]);
  drawField("Financial Contact — Name", formData.financial_contact_name);
  drawFieldRow([
    { label: "Relationship", value: formData.financial_contact_relationship },
    { label: "Phone", value: formData.financial_contact_phone },
  ]);

  // ─── Page 4: Substance & Housing History ────────────────────
  currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  y = PAGE_HEIGHT - MARGIN;
  drawTitle("Substance & Housing History");
  drawField("Facility Name", formData.facility_name);
  drawFieldRow([
    { label: "Date Discharged", value: formData.facility_discharge_date },
    { label: "Length of Stay", value: formData.facility_length_of_stay },
  ]);
  drawField("Completed Program", formData.completed_program);
  if (formData.completed_program === "No") {
    drawField("Reason", formData.program_not_completed_reason);
  }
  drawField("Sobriety Date", formData.sobriety_date);

  // ─── Page 5: Drug Use & Criminal History ────────────────────
  currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  y = PAGE_HEIGHT - MARGIN;
  drawTitle("Drug Use & Criminal History");
  drawField("Drug of Choice", formData.drug_of_choice);
  drawField("Recent Drugs Used & Last Use Dates", formData.recent_drugs);
  drawField("Convicted of felony/misdemeanor", formData.convicted_felon);
  if (formData.convicted_felon === "Yes") {
    drawField("Explanation", formData.conviction_explanation);
  }
  drawField("Sex Offender Status", formData.sex_offender);
  drawField("Violent/Sexual Crime History", formData.violent_crime_history);
  if (formData.violent_crime_history === "Yes") {
    drawField("Explanation", formData.violent_crime_explanation);
  }

  // ─── Pages 6-10: Policies ──────────────────────────────────
  const policies = [
    {
      title: "MAT Medication Storage & Use Policy",
      bullets: [
        "Residents enrolled in MAT programs will be treated equally. Medications must be secured and turned into staff upon admission.",
        "All MAT medications will be locked in the manager's office.",
        "Residents will be given controlled access to medications.",
        "Abuse or stockpiling will be treated as relapse.",
      ],
      sigKey: "mat_policy",
      dateKey: "mat_policy_date",
    },
    {
      title: "Confidentiality Policy",
      bullets: [
        "All resident information is confidential and will be securely stored. Only authorized staff may access this information.",
        "Information may be released with consent.",
        "Exceptions include legal orders or emergencies.",
        "Violation of peer confidentiality may result in discharge.",
      ],
      sigKey: "confidentiality_policy",
      dateKey: "confidentiality_policy_date",
    },
    {
      title: "Good Neighbor Policy",
      bullets: [
        "No excessive noise.",
        "No loitering in front of property.",
        "Keep property clean.",
        "Park only in designated areas.",
      ],
      sigKey: "good_neighbor_policy",
      dateKey: "good_neighbor_policy_date",
    },
    {
      title: "Hazardous Items & Search Policy",
      bullets: [
        "Drugs, alcohol, and mind-altering substances are prohibited.",
        "Weapons and paraphernalia are prohibited.",
        "Searches may occur randomly or upon suspicion.",
      ],
      sigKey: "hazardous_items_policy",
      dateKey: "hazardous_items_policy_date",
    },
    {
      title: "Discharge Policy",
      bullets: [
        "Residents may be discharged if criteria are no longer met.",
        "Lack of progress may result in discharge.",
        "Emergency contacts may be notified.",
      ],
      sigKey: "discharge_policy",
      dateKey: "discharge_policy_date",
    },
  ];

  for (const policy of policies) {
    currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    drawTitle(policy.title);
    drawBullets(policy.bullets);
    y -= 20;
    await drawSignature(policy.sigKey, formData[policy.dateKey]);
  }

  // ─── Page 11: Release of Information ────────────────────────
  currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  y = PAGE_HEIGHT - MARGIN;
  drawTitle("Release of Information (ROI)");
  currentPage.drawText(
    "Residents authorize Jax Sober Living to share information with listed contacts.",
    { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0.3, 0.3, 0.3) }
  );
  y -= LINE_HEIGHT * 2;
  drawField("Contact Name", formData.roi_contact_name);
  drawFieldRow([
    { label: "Relationship", value: formData.roi_contact_relationship },
    { label: "Phone", value: formData.roi_contact_phone },
  ]);
  y -= 10;
  await drawSignature("release_of_information", formData.roi_date);

  // Generate footer on every page
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawText(`Page ${i + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 80,
      y: 20,
      size: 8,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
    pages[i].drawText(
      `Generated ${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })} — Jax Sober Living`,
      {
        x: MARGIN,
        y: 20,
        size: 8,
        font,
        color: rgb(0.6, 0.6, 0.6),
      }
    );
  }

  const pdfBytes = await pdf.save();
  // Convert to base64
  let binary = "";
  const bytes = new Uint8Array(pdfBytes);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
