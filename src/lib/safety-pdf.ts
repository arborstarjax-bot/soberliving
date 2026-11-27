import {
  SAFETY_CHECKLIST,
  type SafetyChecklistResponses,
} from "./safety-checklist";

interface SafetyPdfInput {
  houseName: string;
  houseAddress: string | null;
  assessmentDate: string;
  personCompletingName: string;
  checklist: SafetyChecklistResponses;
  notes: string | null;
  signatureDataUrl: string | null;
}

/**
 * Render a completed Self-Safety Assessment to a single PDF document
 * (multi-page as needed). Designed to reproduce the paper form's
 * structure: property header, sections with ☑/☐ items, free-text
 * notes, person completing, date, and signature at the bottom.
 *
 * Returns the raw PDF bytes.
 */
export async function generateSafetyAssessmentPdf(
  input: SafetyPdfInput
): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [612, 792];
  const marginLeft = 50;
  const marginRight = 50;
  const marginTop = 50;
  const marginBottom = 60;
  const contentWidth = pageSize[0] - marginLeft - marginRight;

  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - marginTop;

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}
  ) => {
    const { size = 10, bold = false, color = [0, 0, 0] } = opts;
    page.drawText(text, {
      x,
      y: yPos,
      size,
      font: bold ? fontBold : font,
      color: rgb(color[0], color[1], color[2]),
    });
  };

  const drawLine = (yPos: number) => {
    page.drawLine({
      start: { x: marginLeft, y: yPos },
      end: { x: pageSize[0] - marginRight, y: yPos },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
  };

  const newPageIfNeeded = (spaceNeeded: number) => {
    if (y - spaceNeeded < marginBottom) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - marginTop;
    }
  };

  /** Wraps a long paragraph at `maxWidth` px using `size`-pt Helvetica. */
  const wrapLines = (
    text: string,
    size: number,
    maxWidth: number,
    bold = false
  ): string[] => {
    const lines: string[] = [];
    const paragraphs = text.split(/\r?\n/);
    const f = bold ? fontBold : font;
    for (const p of paragraphs) {
      const words = p.split(/\s+/);
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        const width = f.widthOfTextAtSize(test, size);
        if (width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      if (paragraphs.length > 1) lines.push("");
    }
    return lines;
  };

  // --- Title ---
  drawText("Self — Safety Assessment", marginLeft, y, { size: 16, bold: true });
  y -= 22;
  drawText(
    "It is the policy of A Endless Summer House to conduct regular self-safety",
    marginLeft,
    y,
    { size: 9, color: [0.3, 0.3, 0.3] }
  );
  y -= 12;
  drawText(
    "assessments monthly. A log of these assessments is maintained at each property location.",
    marginLeft,
    y,
    { size: 9, color: [0.3, 0.3, 0.3] }
  );
  y -= 18;
  drawLine(y);
  y -= 18;

  // --- Property header ---
  drawText("Property:", marginLeft, y, { size: 10, bold: true });
  drawText(input.houseName, marginLeft + 60, y, { size: 10 });
  if (input.houseAddress) {
    y -= 14;
    drawText("Address:", marginLeft, y, { size: 10, bold: true });
    drawText(input.houseAddress, marginLeft + 60, y, { size: 10 });
  }
  y -= 14;
  drawText("Date:", marginLeft, y, { size: 10, bold: true });
  drawText(input.assessmentDate, marginLeft + 60, y, { size: 10 });
  y -= 18;
  drawLine(y);
  y -= 18;

  // --- Sections ---
  for (const section of SAFETY_CHECKLIST) {
    newPageIfNeeded(40);
    drawText(section.title, marginLeft, y, { size: 12, bold: true });
    y -= 16;

    for (const item of section.items) {
      const checked =
        input.checklist[section.key]?.[item.key] === true;
      const glyph = checked ? "X" : " ";

      const wrapped = wrapLines(item.label, 10, contentWidth - 24);
      const lineHeight = 13;
      const itemHeight = Math.max(16, wrapped.length * lineHeight + 4);
      newPageIfNeeded(itemHeight);

      // Checkbox square
      page.drawRectangle({
        x: marginLeft,
        y: y - 10,
        width: 10,
        height: 10,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.8,
      });
      if (checked) {
        // Two diagonals to draw a tick-like X inside the box.
        page.drawLine({
          start: { x: marginLeft + 1.5, y: y - 1.5 },
          end: { x: marginLeft + 8.5, y: y - 8.5 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: marginLeft + 8.5, y: y - 1.5 },
          end: { x: marginLeft + 1.5, y: y - 8.5 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        // `glyph` retained above for legibility if needed by tooling.
        void glyph;
      }

      for (let li = 0; li < wrapped.length; li += 1) {
        drawText(wrapped[li], marginLeft + 18, y - 2 - li * lineHeight, {
          size: 10,
        });
      }
      y -= itemHeight;
    }

    y -= 6;
  }

  // --- Notes ---
  if (input.notes && input.notes.trim().length > 0) {
    newPageIfNeeded(40);
    drawText("Notes", marginLeft, y, { size: 12, bold: true });
    y -= 16;
    const wrapped = wrapLines(input.notes.trim(), 10, contentWidth);
    for (const line of wrapped) {
      newPageIfNeeded(14);
      drawText(line, marginLeft, y, { size: 10 });
      y -= 13;
    }
    y -= 6;
  }

  // --- Signature block ---
  newPageIfNeeded(110);
  drawLine(y);
  y -= 18;
  drawText("Person completing:", marginLeft, y, { size: 10, bold: true });
  drawText(input.personCompletingName, marginLeft + 120, y, { size: 10 });
  y -= 16;
  drawText("Date completed:", marginLeft, y, { size: 10, bold: true });
  drawText(input.assessmentDate, marginLeft + 120, y, { size: 10 });
  y -= 24;
  drawText("Signature:", marginLeft, y, { size: 10, bold: true });
  y -= 6;

  if (input.signatureDataUrl) {
    try {
      const base64 = input.signatureDataUrl.split(",")[1];
      if (base64) {
        const sigBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const sigImage = await pdf.embedPng(sigBytes);
        const targetWidth = 220;
        const scale = targetWidth / sigImage.width;
        const targetHeight = sigImage.height * scale;
        // Sit the signature on the line
        page.drawImage(sigImage, {
          x: marginLeft,
          y: y - targetHeight,
          width: targetWidth,
          height: targetHeight,
        });
        y -= targetHeight + 4;
      }
    } catch {
      // If the signature can't be embedded, keep going — the line and
      // printed name are still sufficient to identify the completer.
    }
  }
  page.drawLine({
    start: { x: marginLeft, y },
    end: { x: marginLeft + 300, y },
    thickness: 0.8,
    color: rgb(0, 0, 0),
  });

  const bytes = await pdf.save();
  return bytes;
}
