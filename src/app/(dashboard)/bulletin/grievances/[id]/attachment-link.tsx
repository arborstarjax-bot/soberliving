"use client";

import { useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { getGrievanceAttachmentUrl } from "../actions";

export function AttachmentLink({
  grievanceId,
  path,
  fileName,
}: {
  grievanceId: string;
  path: string;
  fileName: string;
}) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const result = await getGrievanceAttachmentUrl(grievanceId, path);
      if (result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1 text-sm hover:bg-muted"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Paperclip className="h-3 w-3" />
      )}
      <span className="max-w-[220px] truncate">{fileName}</span>
    </button>
  );
}
