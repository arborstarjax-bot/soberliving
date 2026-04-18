"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, Download, Eye } from "lucide-react";

// We render View / Download as native anchor tags against pre-signed
// Supabase URLs rather than routing through a server action on click.
// Mobile browsers (iOS Safari especially) block `window.open` after an
// `await` because the user-gesture context is gone, which is why the
// old onClick+startTransition+window.open path silently failed on
// phones. With real anchors the browser handles the navigation
// natively from the tap itself and works everywhere.

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
  // id -> signed URL. Generated server-side at render time with a
  // generous TTL so a stale tab won't go cold before a resident gets
  // around to tapping View.
  signedUrls: Record<string, string>;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MyDocumentsView({ groups, signedUrls }: Props) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.key}>
          <CardHeader>
            <CardTitle className="text-base">{g.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {g.docs.map((doc) => {
              const url = signedUrls[doc.id];
              return (
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
                    <a
                      href={url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${doc.name}`}
                      aria-disabled={!url}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-8",
                        !url && "pointer-events-none opacity-50"
                      )}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      View
                    </a>
                    <a
                      href={url ?? "#"}
                      download={doc.name || "document"}
                      rel="noopener noreferrer"
                      aria-label={`Download ${doc.name}`}
                      aria-disabled={!url}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "h-8 w-8 p-0",
                        !url && "pointer-events-none opacity-50"
                      )}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
