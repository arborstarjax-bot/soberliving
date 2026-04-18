"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, Trash2, Upload, ExternalLink, Download } from "lucide-react";
import {
  uploadHouseDocument,
  deleteHouseDocument,
} from "./document-actions";

export interface HouseDocument {
  id: string;
  name: string;
  description: string | null;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  uploader_name: string | null;
}

interface DocumentsListProps {
  houseId: string;
  documents: HouseDocument[];
  canManage: boolean;
  // Pre-signed URLs (doc id -> URL). Generated server-side so Open /
  // Download can be native anchor taps on mobile \u2014 `window.open`
  // after an async server action is blocked on iOS Safari.
  signedUrls: Record<string, string>;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsList({
  houseId,
  documents,
  canManage,
  signedUrls,
}: DocumentsListProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <UploadDialog houseId={houseId} />
        </div>
      )}

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No documents yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const url = signedUrls[doc.id];
            return (
              <Card key={doc.id}>
                <CardContent className="flex items-center justify-between py-3 gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{doc.name}</p>
                      {doc.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {doc.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(doc.created_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })} ·{" "}
                        {formatSize(doc.size_bytes)}
                        {doc.uploader_name && <> · {doc.uploader_name}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!url}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-8",
                        !url && "pointer-events-none opacity-50"
                      )}
                    >
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      Open
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
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive"
                        disabled={isPending}
                        onClick={() => {
                          if (
                            typeof window !== "undefined" &&
                            !window.confirm(`Delete "${doc.name}"?`)
                          )
                            return;
                          startTransition(async () => {
                            const result = await deleteHouseDocument(doc.id);
                            if (result?.error) alert(result.error);
                          });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UploadDialog({ houseId }: { houseId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("houseId", houseId);
    startTransition(async () => {
      const result = await uploadHouseDocument(fd);
      if (result?.error) {
        setError(result.error);
      } else {
        form.reset();
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Upload className="mr-1 h-4 w-4" />
        Upload Document
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload House Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-name">Name</Label>
            <Input id="doc-name" name="name" placeholder="Q1 State of the House report" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-desc">Description (optional)</Label>
            <Input id="doc-desc" name="description" placeholder="Short description" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-file">File</Label>
            <Input
              id="doc-file"
              name="file"
              type="file"
              accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
