import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, Download, Eye } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";

// Staff-facing documents list used on the resident detail page. Like
// the resident MyDocumentsView, signed URLs are generated server-side
// at render time so View / Download work as native anchor taps on
// mobile (iOS Safari blocks `window.open` after an async gap).

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

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function DocumentsList({ documents }: DocumentsListProps) {
  // Parallel-sign every document path. Anything that fails to sign
  // (missing object, expired bucket policy) just renders with a
  // disabled button so the whole list doesn't break.
  const adminClient = createAdminClient();
  const signedUrls: Record<string, string> = {};
  await Promise.all(
    documents.map(async (d) => {
      const { data } = await adminClient.storage
        .from("documents")
        .createSignedUrl(d.storage_path, 3600);
      if (data?.signedUrl) signedUrls[d.id] = data.signedUrl;
    })
  );

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
            {documents.map((doc) => {
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
