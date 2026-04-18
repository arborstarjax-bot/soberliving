"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/signature-pad";
import { acknowledgeBlocker, getBlockerAttachmentUrl } from "./actions";
import { FileIcon, Loader2 } from "lucide-react";

interface AcknowledgeFormProps {
  blockerId: string;
  title: string;
  body: string;
  attachmentPaths: string[];
  saveToDocs: boolean;
  residentName: string;
}

/**
 * Renders the attachment list (photos inline + download cards for
 * everything else) plus the signature pad + submit button. On
 * submit we optionally generate a "Signed Acknowledgment" PDF
 * client-side (same pattern as the commitment signing flow) when
 * saveToDocs is true, so the signature never has to round-trip
 * through the server before being rendered into the PDF.
 */
export function AcknowledgeForm({
  blockerId,
  title,
  body,
  attachmentPaths,
  saveToDocs,
  residentName,
}: AcknowledgeFormProps) {
  const router = useRouter();
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const generatePdf = useCallback(
    async (sig: string): Promise<string> => {
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const page = pdf.addPage([612, 792]);
      const { height } = page.getSize();
      let y = height - 50;

      const draw = (text: string, x: number, size = 10, bold = false) => {
        page.drawText(text, {
          x,
          y,
          size,
          font: bold ? fontBold : font,
          color: rgb(0, 0, 0),
        });
      };

      draw("JAX SOBER LIVING", 220, 16, true);
      y -= 22;
      draw("ACKNOWLEDGMENT RECEIPT", 200, 14, true);
      y -= 30;
      draw(`Resident: ${residentName}`, 50, 11);
      y -= 18;
      draw(`Signed: ${new Date().toLocaleString()}`, 50, 11);
      y -= 26;
      draw(title, 50, 12, true);
      y -= 20;

      // Wrap body at a coarse char-per-line estimate — good enough for
      // the short messages we expect and avoids pulling in a real
      // line-breaking lib.
      const bodyLines = wrapText(body, 95);
      for (const line of bodyLines) {
        draw(line, 50, 10);
        y -= 14;
        if (y < 150) break;
      }

      y -= 30;
      draw("Resident Signature:", 50, 10, true);
      try {
        const sigBytes = Uint8Array.from(
          atob(sig.split(",")[1] || ""),
          (c) => c.charCodeAt(0)
        );
        const sigImage = await pdf.embedPng(sigBytes);
        page.drawImage(sigImage, {
          x: 50,
          y: y - 55,
          width: 180,
          height: 45,
        });
      } catch {
        draw("[signature recorded]", 50, 9);
      }

      const bytes = await pdf.save();
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(i, i + chunk))
        );
      }
      return btoa(bin);
    },
    [title, body, residentName]
  );

  async function handleSubmit() {
    if (!signature) {
      setError("Please sign above to continue.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const pdfBase64 = saveToDocs ? await generatePdf(signature) : null;
        const result = await acknowledgeBlocker(
          blockerId,
          signature,
          pdfBase64
        );
        if (result?.error) {
          setError(result.error);
          return;
        }
        // revalidatePath inside the action invalidates the dashboard
        // layout cache. router.refresh forces the next navigation
        // to re-run the layout gate, which will either redirect to
        // the next pending blocker or let the user into /dashboard.
        router.refresh();
        router.push("/dashboard");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to acknowledge"
        );
      }
    });
  }

  return (
    <>
      {attachmentPaths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attachments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attachmentPaths.map((path) => (
              <AttachmentRow
                key={path}
                blockerId={blockerId}
                storagePath={path}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Sign to acknowledge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            By signing below, I confirm I have read and understand the
            message above.
          </p>
          <SignaturePad
            onSignatureChange={(val) => setSignature(val)}
            label="Your Signature"
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!signature || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "I acknowledge"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function wrapText(input: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const raw of input.split("\n")) {
    if (raw.length <= maxChars) {
      out.push(raw);
      continue;
    }
    let buf = "";
    for (const word of raw.split(/\s+/)) {
      if ((buf + " " + word).trim().length > maxChars) {
        out.push(buf.trim());
        buf = word;
      } else {
        buf = buf ? `${buf} ${word}` : word;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return /\.(png|jpe?g|gif|webp|heic)$/.test(lower);
}

function AttachmentRow({
  blockerId,
  storagePath,
}: {
  blockerId: string;
  storagePath: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filename = storagePath.split("/").pop() ?? storagePath;
  const isImage = isImagePath(storagePath);

  useEffect(() => {
    let cancelled = false;
    getBlockerAttachmentUrl(blockerId, storagePath).then((r) => {
      if (cancelled) return;
      if (r.error) setError(r.error);
      else setUrl(r.url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [blockerId, storagePath]);

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Couldn&apos;t load {filename}: {error}
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading {filename}…
      </div>
    );
  }
  if (isImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <img
          src={url}
          alt={filename}
          className="max-w-full rounded-md border"
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted"
    >
      <FileIcon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1">{filename}</span>
      <span className="text-xs text-muted-foreground">Open</span>
    </a>
  );
}

