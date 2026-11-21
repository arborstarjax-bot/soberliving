/**
 * Generate a PDF for the completed check-in form using pdf-lib.
 * Follows the same pattern as commitment-signing-form.tsx and generate-pdf.ts.
 */
export async function generateCheckInPdf(
  formData: Record<string, string>,
  residentName: string,
  houseName: string,
  residentSignature?: string | null
): Promise<string> {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([612, 792]);
  const { height } = page.getSize();
  let y = height - 50;

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    size = 10,
    bold = false
  ) => {
    page.drawText(text, {
      x,
      y: yPos,
      size,
      font: bold ? fontBold : font,
      color: rgb(0, 0, 0),
    });
  };

  const drawLine = (yPos: number) => {
    page.drawLine({
      start: { x: 50, y: yPos },
      end: { x: 562, y: yPos },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
  };

  // Header
  drawText("JSL RESIDENT MONTHLY CHECK-IN", 150, y, 16, true);
  y -= 30;

  // Prefill section
  drawText("Resident:", 50, y, 10, true);
  drawText(residentName, 120, y);
  drawText("Date:", 300, y, 10, true);
  drawText(formData.date ?? new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" }), 340, y);
  drawText("House:", 440, y, 10, true);
  drawText(houseName, 485, y);
  y -= 10;
  drawLine(y);
  y -= 20;

  // Q1: Meeting rating
  drawText("1. How do you feel about meetings?", 50, y, 10, true);
  y -= 15;
  drawText(`Rating: ${formData.meeting_rating ?? "—"} / 10`, 70, y);
  y -= 20;

  // Q2: Mandatory meetings (checkboxes)
  drawText(
    "2. Of your 7 mandatory meetings a week, are you making at least one of the following?",
    50,
    y,
    10,
    true
  );
  y -= 15;
  const meetingItems = [];
  if (formData.meeting_step === "true") meetingItems.push("Step Meeting");
  if (formData.meeting_big_book === "true") meetingItems.push("Big Book Meeting");
  if (formData.meeting_speaker === "true") meetingItems.push("Speaker Meeting");
  drawText(
    meetingItems.length > 0 ? meetingItems.join(", ") : "None selected",
    70,
    y
  );
  y -= 20;

  // Q3: Sponsor
  drawText("3. Do you have a sponsor?", 50, y, 10, true);
  y -= 15;
  drawText(formData.has_sponsor ?? "—", 70, y);
  y -= 20;

  // Q4: Call sponsor
  drawText("4. How often do you call your sponsor?", 50, y, 10, true);
  y -= 15;
  drawText(formData.call_sponsor_frequency ?? "—", 70, y);
  y -= 20;

  // Q5: Current step (1-12)
  drawText("5. What step are you working on now?", 50, y, 10, true);
  y -= 15;
  drawText(formData.current_step ? `Step ${formData.current_step}` : "—", 70, y);
  y -= 20;

  // Q6: Current job
  drawText("6. What is your current job?", 50, y, 10, true);
  y -= 15;
  drawText(formData.current_job ?? "—", 70, y);
  y -= 20;

  // Q7: Work rating
  drawText("7. How is work going?", 50, y, 10, true);
  y -= 15;
  drawText(`Rating: ${formData.work_rating ?? "—"} / 10`, 70, y);
  y -= 20;

  // Q8: Feeling about JSL
  drawText(
    "8. How are you feeling about being a resident at JSL?",
    50,
    y,
    10,
    true
  );
  y -= 15;
  drawText(`Rating: ${formData.jsl_feeling_rating ?? "—"} / 10`, 70, y);
  y -= 20;

  // Q9: Spiritual growth
  drawText(
    "9. What are you doing daily to grow spiritually?",
    50,
    y,
    10,
    true
  );
  y -= 15;
  const spiritualItems = [];
  if (formData.spiritual_literature === "true") spiritualItems.push("Literature");
  if (formData.spiritual_prayer === "true") spiritualItems.push("Prayer");
  if (formData.spiritual_meditation === "true")
    spiritualItems.push("Meditation");
  drawText(
    spiritualItems.length > 0 ? spiritualItems.join(", ") : "None selected",
    70,
    y
  );
  y -= 20;

  // Q10: Questions/concerns
  drawText(
    "10. Do you have any questions or concerns I can help you with?",
    50,
    y,
    10,
    true
  );
  y -= 15;
  const concerns = formData.questions_concerns ?? "None";
  // Word-wrap for long text
  const maxWidth = 480;
  const words = concerns.split(" ");
  let line = "";
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, 10);
    if (width > maxWidth && line) {
      drawText(line, 70, y);
      y -= 14;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    drawText(line, 70, y);
    y -= 30;
  }

  // Resident signature
  drawLine(y + 5);
  y -= 15;
  drawText("Resident Signature:", 50, y, 10, true);
  y -= 10;

  if (residentSignature) {
    try {
      // The signature is a data:image/png;base64,... URL
      const base64Data = residentSignature.split(",")[1];
      if (base64Data) {
        const sigBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const sigImage = await pdf.embedPng(sigBytes);
        const sigDims = sigImage.scale(0.25);
        const drawWidth = Math.min(sigDims.width, 200);
        const drawHeight = (drawWidth / sigDims.width) * sigDims.height;
        page.drawImage(sigImage, {
          x: 70,
          y: y - drawHeight,
          width: drawWidth,
          height: drawHeight,
        });
        y -= drawHeight + 10;
      }
    } catch {
      // If signature embedding fails, just note it
      drawText("[Signature on file]", 70, y - 15);
      y -= 25;
    }
  }
  y -= 10;

  // Completed timestamp
  drawText(
    `Completed: ${new Date().toLocaleString("en-US")}`,
    50,
    y,
    8
  );

  // Save PDF
  const pdfBytes = await pdf.save();
  const bytes = new Uint8Array(pdfBytes);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
