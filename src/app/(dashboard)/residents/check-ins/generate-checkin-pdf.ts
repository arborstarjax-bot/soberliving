import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

interface CheckInResponse {
  residentName: string;
  status: string;
  completedAt: string | null;
  formData: Record<string, unknown> | null;
}

interface CheckInBatchForPdf {
  houseNames: string;
  createdBy: string;
  createdAt: string;
  completedCount: number;
  totalCount: number;
  responses: CheckInResponse[];
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const LINE_HEIGHT = 16;
const SECTION_GAP = 24;

function get(formData: Record<string, unknown>, key: string): string {
  return String(formData[key] ?? "—");
}

export async function generateCheckInBatchPdf(
  batch: CheckInBatchForPdf,
  facilityName: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const dark = rgb(0.1, 0.1, 0.15);
  const muted = rgb(0.4, 0.4, 0.45);
  const accent = rgb(0.2, 0.25, 0.45);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawText(
    text: string,
    x: number,
    options: {
      size?: number;
      color?: ReturnType<typeof rgb>;
      bold?: boolean;
      maxWidth?: number;
    } = {}
  ) {
    const { size = 10, color = dark, bold = false, maxWidth } = options;
    const f = bold ? fontBold : font;

    if (maxWidth) {
      const words = text.split(" ");
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
          ensureSpace(LINE_HEIGHT);
          page.drawText(line, { x, y, size, font: f, color });
          y -= LINE_HEIGHT;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) {
        ensureSpace(LINE_HEIGHT);
        page.drawText(line, { x, y, size, font: f, color });
        y -= LINE_HEIGHT;
      }
    } else {
      ensureSpace(LINE_HEIGHT);
      page.drawText(text, { x, y, size, font: f, color });
      y -= LINE_HEIGHT;
    }
  }

  // ─── Header ──────────────────────────────────────────────
  drawText(facilityName, MARGIN, { size: 16, bold: true, color: accent });
  drawText("Monthly Check-In Report", MARGIN, { size: 12, bold: true });
  y -= 4;
  drawText(`Houses: ${batch.houseNames}`, MARGIN, { size: 10, color: muted });
  drawText(
    `Sent by ${batch.createdBy} on ${new Date(batch.createdAt).toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "long",
      day: "numeric",
      year: "numeric",
    })}`,
    MARGIN,
    { size: 10, color: muted }
  );
  drawText(
    `Responses: ${batch.completedCount} of ${batch.totalCount} completed`,
    MARGIN,
    { size: 10, color: muted }
  );

  y -= SECTION_GAP;

  // ─── Divider ─────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.88),
  });
  y -= SECTION_GAP;

  // ─── Responses ───────────────────────────────────────────
  const completed = batch.responses.filter((r) => r.status === "completed" && r.formData);
  const pending = batch.responses.filter((r) => r.status !== "completed");

  for (const response of completed) {
    ensureSpace(140);

    drawText(response.residentName, MARGIN, { size: 12, bold: true });
    if (response.completedAt) {
      drawText(
        `Completed: ${new Date(response.completedAt).toLocaleDateString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`,
        MARGIN,
        { size: 9, color: muted }
      );
    }
    y -= 4;

    const fd = response.formData!;

    const meetingTypes = [
      fd.meeting_step === "true" && "Step Meeting",
      fd.meeting_big_book === "true" && "Big Book Meeting",
      fd.meeting_speaker === "true" && "Speaker Meeting",
    ]
      .filter(Boolean)
      .join(", ") || "None selected";

    const spiritualItems = [
      fd.spiritual_literature === "true" && "Literature",
      fd.spiritual_prayer === "true" && "Prayer",
      fd.spiritual_meditation === "true" && "Meditation",
    ]
      .filter(Boolean)
      .join(", ") || "None";

    drawText(`1. Meeting rating: ${get(fd, "meeting_rating")}/10`, MARGIN + 10, { size: 9 });
    drawText(`2. Meetings attended: ${meetingTypes}`, MARGIN + 10, { size: 9 });
    drawText(`3. Has sponsor: ${get(fd, "has_sponsor")}`, MARGIN + 10, { size: 9 });
    drawText(`4. Call sponsor frequency: ${get(fd, "call_sponsor_frequency")}`, MARGIN + 10, { size: 9 });
    drawText(`5. Current step: ${fd.current_step ? `Step ${get(fd, "current_step")}` : "—"}`, MARGIN + 10, { size: 9 });
    drawText(`6. Work rating: ${get(fd, "work_rating")}/10`, MARGIN + 10, { size: 9 });
    drawText(`7. JSL feeling rating: ${get(fd, "jsl_feeling_rating")}/10`, MARGIN + 10, { size: 9 });
    drawText(`8. Spiritual growth: ${spiritualItems}`, MARGIN + 10, { size: 9 });

    if (fd.questions_concerns) {
      drawText("9. Questions/concerns:", MARGIN + 10, { size: 9 });
      drawText(get(fd, "questions_concerns"), MARGIN + 20, {
        size: 9,
        color: muted,
        maxWidth: PAGE_WIDTH - MARGIN * 2 - 30,
      });
    }

    y -= SECTION_GAP / 2;

    // Light separator between responses
    page.drawLine({
      start: { x: MARGIN + 10, y: y + 4 },
      end: { x: PAGE_WIDTH - MARGIN - 10, y: y + 4 },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.92),
    });
    y -= SECTION_GAP / 2;
  }

  // ─── Pending section ─────────────────────────────────────
  if (pending.length > 0) {
    ensureSpace(40);
    drawText("Pending Responses", MARGIN, { size: 11, bold: true, color: muted });
    y -= 4;
    for (const r of pending) {
      drawText(`• ${r.residentName}`, MARGIN + 10, { size: 9, color: muted });
    }
  }

  return doc.save();
}
