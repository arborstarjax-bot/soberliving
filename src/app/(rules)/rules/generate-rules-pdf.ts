import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { RULES_SLIDES } from "./rules-content";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const LINE_HEIGHT = 13;
const FONT_SIZE = 9.5;
const TITLE_SIZE = 16;
const SECTION_SIZE = 11;
const BORDER_INSET = 28;

/**
 * Generates a complete PDF containing all house rules and the resident's
 * signature acknowledgment. This PDF mirrors the physical rules document
 * and serves as legal proof that the resident has read and agreed to all rules.
 */
export async function generateRulesAcknowledgmentPdf(
  residentName: string,
  signatureDataUrl: string
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italicFont = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const boldItalicFont = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);

  let currentPage: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function drawBorder(page: PDFPage) {
    page.drawRectangle({
      x: BORDER_INSET,
      y: BORDER_INSET,
      width: PAGE_WIDTH - 2 * BORDER_INSET,
      height: PAGE_HEIGHT - 2 * BORDER_INSET,
      borderWidth: 0.75,
      borderColor: rgb(0, 0, 0),
    });
  }
  drawBorder(currentPage);

  function newPage() {
    currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawBorder(currentPage);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 20) {
      newPage();
    }
  }

  function wrapText(text: string, f: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    // Strip HTML tags for PDF
    const clean = text.replace(/<[^>]+>/g, "");
    for (const rawLine of clean.split("\n")) {
      if (!rawLine) { lines.push(""); continue; }
      const words = rawLine.split(" ");
      let cur = "";
      for (const w of words) {
        const candidate = cur ? `${cur} ${w}` : w;
        if (f.widthOfTextAtSize(candidate, size) > maxWidth) {
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

  function drawCenteredTitle(text: string) {
    ensureSpace(TITLE_SIZE + 20);
    const full = `- ${text} -`;
    const width = boldItalicFont.widthOfTextAtSize(full, TITLE_SIZE);
    const x = (PAGE_WIDTH - width) / 2;
    currentPage.drawText(full, { x, y, size: TITLE_SIZE, font: boldItalicFont, color: rgb(0, 0, 0) });
    y -= TITLE_SIZE + 14;
  }

  function drawSectionHeading(text: string) {
    ensureSpace(SECTION_SIZE + 8);
    currentPage.drawText(text, { x: MARGIN, y, size: SECTION_SIZE, font: boldFont, color: rgb(0, 0, 0) });
    y -= SECTION_SIZE + 6;
  }

  function drawParagraph(text: string, useFont: PDFFont = font) {
    const maxWidth = PAGE_WIDTH - 2 * MARGIN;
    const lines = wrapText(text, useFont, FONT_SIZE, maxWidth);
    for (const line of lines) {
      ensureSpace(LINE_HEIGHT);
      currentPage.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font: useFont, color: rgb(0, 0, 0) });
      y -= LINE_HEIGHT;
    }
  }

  function drawNumberedItem(num: number, text: string) {
    const maxWidth = PAGE_WIDTH - 2 * MARGIN - 24;
    const clean = text.replace(/<[^>]+>/g, "");
    const lines = wrapText(clean, font, FONT_SIZE, maxWidth);
    ensureSpace(LINE_HEIGHT * lines.length + 4);
    // Draw number
    currentPage.drawText(`${num}.`, { x: MARGIN, y, size: FONT_SIZE, font: boldFont, color: rgb(0, 0, 0) });
    // Draw text lines
    for (const line of lines) {
      currentPage.drawText(line, { x: MARGIN + 24, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
      y -= LINE_HEIGHT;
    }
    y -= 2;
  }

  function drawBullet(text: string) {
    const maxWidth = PAGE_WIDTH - 2 * MARGIN - 16;
    const lines = wrapText(text, font, FONT_SIZE, maxWidth);
    ensureSpace(LINE_HEIGHT * lines.length + 2);
    currentPage.drawText("\u2022", { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
    for (const line of lines) {
      currentPage.drawText(line, { x: MARGIN + 16, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
      y -= LINE_HEIGHT;
    }
    y -= 2;
  }

  // ─── Title page ───
  drawCenteredTitle("JSL Sober Living Residences");
  y -= 10;
  drawCenteredTitle("House Rules & Consequences");
  y -= 20;

  // ─── Render all slides content ───
  for (const slide of RULES_SLIDES) {
    // Skip the title slide (first one, already handled)
    if (slide.title === "House Rules & Consequences") continue;

    drawSectionHeading(slide.title);

    if (slide.items) {
      for (const item of slide.items) {
        if (item.num !== undefined) {
          drawNumberedItem(item.num, item.text);
        } else {
          drawParagraph(item.text.replace(/<[^>]+>/g, ""));
        }
      }
    }

    if (slide.bullets) {
      for (const b of slide.bullets) {
        drawBullet(b);
      }
    }

    if (slide.warning) {
      y -= 4;
      drawParagraph(slide.warning.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""), boldFont);
      y -= 4;
    }

    if (slide.note) {
      y -= 2;
      drawParagraph(slide.note, italicFont);
    }

    y -= 10;
  }

  // ─── Acknowledgment section ───
  newPage();
  drawCenteredTitle("Acknowledgment of House Rules");
  y -= 10;

  drawParagraph("By signing below, I acknowledge that:", boldFont);
  y -= 4;
  drawBullet("I have read and understand all house rules and consequences");
  drawBullet("I agree to abide by all rules during my stay");
  drawBullet("Violation of rules may result in loss of privileges or discharge");
  drawBullet("Relapse, physical violence, stealing, or tampering with cameras will result in immediate discharge");
  y -= 20;

  // Resident name
  drawParagraph(`Resident Name: ${residentName}`, boldFont);
  y -= 6;

  // Date
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  drawParagraph(`Date: ${today}`, font);
  y -= 16;

  // Signature
  drawParagraph("Resident Signature:", boldFont);
  y -= 4;

  // Embed signature image
  try {
    const sigBase64 = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
    const sigBytes = Uint8Array.from(atob(sigBase64), (c) => c.charCodeAt(0));
    const sigImage = await pdf.embedPng(sigBytes);
    const sigDims = sigImage.scale(0.5);
    const sigWidth = Math.min(sigDims.width, PAGE_WIDTH - 2 * MARGIN);
    const sigHeight = (sigWidth / sigDims.width) * sigDims.height;
    ensureSpace(sigHeight + 10);
    currentPage.drawImage(sigImage, {
      x: MARGIN,
      y: y - sigHeight,
      width: sigWidth,
      height: sigHeight,
    });
    y -= sigHeight + 10;
  } catch {
    drawParagraph("[Signature on file]", italicFont);
  }

  // Draw line under signature
  currentPage.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  y -= 14;
  drawParagraph("Signature", italicFont);

  const pdfBytes = await pdf.save();
  return Buffer.from(pdfBytes);
}
