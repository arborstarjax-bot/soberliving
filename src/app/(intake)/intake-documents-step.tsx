"use client";

import { useRef, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileCheck, Loader2, Upload } from "lucide-react";
import { uploadIntakeDocument } from "./actions";

/**
 * Final step of both intake flows: a document vault where the
 * resident can attach any files to their record (ID, prescriptions,
 * court paperwork, ...). Every upload lands in `documents` under
 * their user so staff can see it on their profile.
 */
export function IntakeDocumentsStep({
  continueHref,
}: {
  continueHref: string;
}) {
  const [docs, setDocs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("label", labelRef.current?.value ?? "");
    startTransition(async () => {
      const result = await uploadIntakeDocument(fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setDocs((prev) => [...prev, labelRef.current?.value || file.name]);
        if (fileRef.current) fileRef.current.value = "";
        if (labelRef.current) labelRef.current.value = "";
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Documents</CardTitle>
        <CardDescription>
          Upload anything staff should have on file — photo ID,
          prescriptions, court paperwork, insurance cards. Optional;
          you can also add documents later from My Documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {docs.length > 0 && (
          <ul className="space-y-2">
            {docs.map((name, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <FileCheck className="h-4 w-4 text-green-600" />
                {name}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-md border border-dashed p-4">
          <div className="space-y-1">
            <Label htmlFor="doc-label">Document name (optional)</Label>
            <Input
              id="doc-label"
              ref={labelRef}
              placeholder="e.g. Driver's License"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-file">File</Label>
            <Input id="doc-file" ref={fileRef} type="file" />
            <p className="text-xs text-muted-foreground">
              Photos and PDFs up to 10 MB.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="button"
            variant="outline"
            onClick={handleUpload}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            Upload document
          </Button>
        </div>

        <a
          href={continueHref}
          className={cn(buttonVariants(), "w-full")}
        >
          {docs.length > 0 ? "Continue" : "Skip for now"}
        </a>
      </CardContent>
    </Card>
  );
}
