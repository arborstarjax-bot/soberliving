"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { getDocumentUrl } from "@/app/(intake)/actions";

// Receipt download button used on the payments list. Hits the same
// getDocumentUrl server action as the Documents list — generates a
// signed Supabase URL (1h) and opens it in a new tab. The owner of
// the payment (or any staff) can fetch it; RLS is enforced in the
// action.

interface Props {
  storagePath: string | null;
  receiptNumber: string | null;
  size?: "sm" | "default";
}

export function DownloadReceiptButton({
  storagePath,
  receiptNumber,
  size = "sm",
}: Props) {
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  if (!storagePath) return null;
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
