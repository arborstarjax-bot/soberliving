"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2 } from "lucide-react";
import { getDocumentUrl } from "@/app/(intake)/actions";

interface DocumentRecord {
  id: string;
  name: string;
  document_type: string;
  storage_path: string;
  file_size: number | null;
  created_at: string;
}

interface DocumentsListProps {
  documents: DocumentRecord[];
}

export function DocumentsList({ documents }: DocumentsListProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDownload(doc: DocumentRecord) {
    setDownloadingId(doc.id);
    startTransition(async () => {
      const result = await getDocumentUrl(doc.storage_path);
      if (result.url) {
        window.open(result.url, "_blank");
      }
      setDownloadingId(null);
    });
  }

  function formatBytes(bytes: number | null) {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No documents yet
          </p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()} •{" "}
                      {formatBytes(doc.file_size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(doc)}
                  disabled={isPending && downloadingId === doc.id}
                >
                  {isPending && downloadingId === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
