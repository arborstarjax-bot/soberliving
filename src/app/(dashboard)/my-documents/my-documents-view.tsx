"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Eye, Loader2 } from "lucide-react";
import { getDocumentUrl } from "@/app/(intake)/actions";

interface DocumentRecord {
  id: string;
  name: string;
  document_type: string;
  storage_path: string;
  file_size: number | null;
  created_at: string;
}

interface Props {
  groups: { key: string; label: string; docs: DocumentRecord[] }[];
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type DocAction = "view" | "download";

export function MyDocumentsView({ groups }: Props) {
  const [pendingAction, setPendingAction] = useState<
    { id: string; action: DocAction } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen(doc: DocumentRecord, action: DocAction) {
    setPendingAction({ id: doc.id, action });
    startTransition(async () => {
      const result = await getDocumentUrl(doc.storage_path);
      if (result.url) {
        if (action === "view") {
          window.open(result.url, "_blank", "noopener");
        } else {
          // Force a file-save. `window.open` with a Supabase signed URL
          // would just preview the PDF in the browser tab, so we route
          // through a hidden anchor with the `download` attribute.
          const a = document.createElement("a");
          a.href = result.url;
          a.download = doc.name || "document";
          a.rel = "noopener";
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      }
      setPendingAction(null);
    });
  }

  const busy = (id: string, action: DocAction) =>
    isPending && pendingAction?.id === id && pendingAction.action === action;

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.key}>
          <CardHeader>
            <CardTitle className="text-base">{g.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {g.docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })} •{" "}
                      {formatBytes(doc.file_size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => handleOpen(doc, "view")}
                    disabled={busy(doc.id, "view")}
                    aria-label={`View ${doc.name}`}
                  >
                    {busy(doc.id, "view") ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="mr-1 h-3.5 w-3.5" />
                    )}
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleOpen(doc, "download")}
                    disabled={busy(doc.id, "download")}
                    aria-label={`Download ${doc.name}`}
                  >
                    {busy(doc.id, "download") ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
