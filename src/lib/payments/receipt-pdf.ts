import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDateOnly, formatInAppTz } from "@/lib/timezone";

// Server-side receipt PDF generator. Produces a single-page letter
// with the facility + house header, resident name, receipt number,
// amount, method, and the billing period covered. Mirrors the look
// of the signed commitment PDF so the document pack feels cohesive.
// Returns the raw PDF bytes; the caller uploads them to the
// documents bucket and links the row on payments.receipt_document_id.

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 60;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  // This helper is called with both date-only strings (period_start,
  // period_end, dueDate — all Postgres `date` columns) and full
  // timestamptz values (paidAt). For date-only values we render the
  // stored calendar day; for timestamps we render the Eastern-time
  // day the event happened.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return formatDateOnly(iso, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatInAppTz(d, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return null;
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return formatDate(start ?? end);
}

function titleCase(s: string) {
  return s
    .split(/[\s_]+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export interface ReceiptData {
  receiptNumber: string;
  paidAt: string;
  facilityName: string;
  houseName: string;
  houseAddress?: string | null;
  residentName: string;
  amount: number;
  paymentType: string;
  paymentMethod?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  dueDate?: string | null;
  note?: string | null;
  recordedByName: string;
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  let y = PAGE_HEIGHT - MARGIN;

  // Header — facility name + RECEIPT label.
  page.drawText(data.facilityName, {
    x: MARGIN,
    y,
    size: 18,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText("PAYMENT RECEIPT", {
    x: PAGE_WIDTH - MARGIN - boldFont.widthOfTextAtSize("PAYMENT RECEIPT", 12),
    y: y + 4,
    size: 12,
    font: boldFont,
    color: rgb(0.3, 0.3, 0.3),
  });

  y -= 26;
  if (data.houseName) {
    page.drawText(data.houseName, {
      x: MARGIN,
      y,
      size: 11,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 14;
  }
  if (data.houseAddress) {
    page.drawText(data.houseAddress, {
      x: MARGIN,
      y,
      size: 10,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
    y -= 14;
  }

  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 24;

  // Receipt number + paid date, right-aligned summary block.
  const meta: Array<[string, string]> = [
    ["Receipt Number", data.receiptNumber],
    ["Paid On", formatDate(data.paidAt)],
  ];
  for (const [label, value] of meta) {
    page.drawText(label, {
      x: MARGIN,
      y,
      size: 9,
      font: boldFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(value, {
      x: MARGIN + 120,
      y,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 18;
  }

  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 24;

  // Billed to + payment details.
  page.drawText("BILLED TO", {
    x: MARGIN,
    y,
    size: 9,
    font: boldFont,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 14;
  page.drawText(data.residentName, {
    x: MARGIN,
    y,
    size: 13,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 28;

  const rows: Array<[string, string | null | undefined]> = [
    ["Payment Type", titleCase(data.paymentType)],
    ["Method", data.paymentMethod ? titleCase(data.paymentMethod) : "—"],
    ["Period Covered", formatDateRange(data.periodStart, data.periodEnd)],
    ["Due Date", data.dueDate ? formatDate(data.dueDate) : null],
    ["Note", data.note?.trim() || null],
  ];

  for (const [label, value] of rows) {
    if (!value) continue;
    page.drawText(label, {
      x: MARGIN,
      y,
      size: 9,
      font: boldFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(value, {
      x: MARGIN + 140,
      y,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 18;
  }

  y -= 16;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 28;

  // Amount — emphasized block at the bottom.
  page.drawText("AMOUNT PAID", {
    x: MARGIN,
    y,
    size: 10,
    font: boldFont,
    color: rgb(0.4, 0.4, 0.4),
  });
  const amountText = formatCurrency(data.amount);
  const amountWidth = boldFont.widthOfTextAtSize(amountText, 28);
  page.drawText(amountText, {
    x: PAGE_WIDTH - MARGIN - amountWidth,
    y: y - 6,
    size: 28,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 42;

  // Footer — recorded by + timestamp for the audit trail.
  y = MARGIN + 32;
  page.drawLine({
    start: { x: MARGIN, y: y + 10 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 10 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  page.drawText(`Recorded by ${data.recordedByName}`, {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
  const generatedAt = `Generated ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`;
  const genWidth = font.widthOfTextAtSize(generatedAt, 9);
  page.drawText(generatedAt, {
    x: PAGE_WIDTH - MARGIN - genWidth,
    y,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });

  return await pdf.save();
}
