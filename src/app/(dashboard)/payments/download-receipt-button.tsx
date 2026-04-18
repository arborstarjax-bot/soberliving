"use client";

import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, Loader2 } from "lucide-react";
import { getDocumentUrl } from "@/app/(intake)/actions";

// Receipt download button used on the payments list.
//
// Preferred path: caller pre-signs the storage path server-side and
// passes `signedUrl` \u2014 the button renders as a native anchor tag so
// iOS Safari doesn't block the tab (mobile blocks `window.open` when
// it's invoked after an async gap). Legacy callers that still pass
// only `storagePath` fall back to the old onClick+server-action path
// which works fine on desktop but is known to fail on mobile.

interface Props {
  storagePath: string | null;
  receiptNumber: string | null;
  size?: "sm" | "default";
  signedUrl?: string | null;
}

export function DownloadReceiptButton({
  storagePath,
  receiptNumber,
  size = "sm",
  signedUrl,
}: Props) {
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  if (!storagePath) return null;

  if (signedUrl) {
    return (
      <a
        href={signedUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={receiptNumber ? `Receipt ${receiptNumber}` : "Receipt"}
        aria-label={
          receiptNumber ? `Download receipt ${receiptNumber}` : "Download receipt"
        }
        className={cn(
          buttonVariants({ variant: "ghost", size }),
          "h-8 px-2 text-xs gap-1"
        )}
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Receipt</span>
      </a>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className="h-8 px-2 text-xs gap-1"
      disabled={pending}
      onClick={() => {
        setPending(true);
        startTransition(async () => {
          const res = await getDocumentUrl(storagePath);
          if (res.url) window.open(res.url, "_blank");
          setPending(false);
        });
      }}
      title={receiptNumber ? `Receipt ${receiptNumber}` : "Receipt"}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">Receipt</span>
    </Button>
  );
}
