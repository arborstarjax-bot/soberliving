"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Paperclip, X } from "lucide-react";
import type { GrievanceType } from "@/lib/types";
import { submitGrievance, uploadGrievanceAttachment } from "./actions";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export function NewGrievanceForm() {
  const router = useRouter();
  const [reportType, setReportType] = useState<GrievanceType>("grievance");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitAnonymously, setSubmitAnonymously] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachmentNames, setAttachmentNames] = useState<
    Record<string, string>
  >({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const remaining = MAX_FILES - attachments.length;
    if (remaining <= 0) {
      setUploadError(`Max ${MAX_FILES} attachments reached`);
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const toUpload = Array.from(fileList).slice(0, remaining);
      for (const file of toUpload) {
        if (file.size > MAX_BYTES) {
          setUploadError(`${file.name} exceeds 10MB — skipped`);
          continue;
        }
        const fd = new FormData();
        fd.set("file", file);
        const result = await uploadGrievanceAttachment(fd);
        if (result.error || !result.path) {
          setUploadError(result.error ?? "Upload failed");
          continue;
        }
        setAttachments((prev) => [...prev, result.path as string]);
        setAttachmentNames((prev) => ({
          ...prev,
          [result.path as string]: file.name,
        }));
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleSubmit() {
    setSubmitError(null);
    if (!subject.trim() || !description.trim()) {
      setSubmitError("Subject and description are required");
      return;
    }
    startTransition(async () => {
      const result = await submitGrievance({
        reportType,
        subject: subject.trim(),
        description: description.trim(),
        attachmentPaths: attachments,
        submitAnonymously,
      });
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      setSubmitted(true);
      router.refresh();
    });
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-lg font-semibold">Report submitted</p>
          <p className="text-sm text-muted-foreground">
            {submitAnonymously
              ? "Your report has been submitted anonymously. No trace of your identity is stored with it."
              : "Your report has been submitted. An admin will review it."}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setReportType("grievance");
              setSubject("");
              setDescription("");
              setSubmitAnonymously(false);
              setAttachments([]);
              setAttachmentNames({});
              setSubmitted(false);
              setSubmitError(null);
              setUploadError(null);
            }}
          >
            Submit another
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>File a Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Report Type</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <TypeRadio
              label="Grievance"
              description="Concern about a person, policy, or treatment"
              checked={reportType === "grievance"}
              onChange={() => setReportType("grievance")}
            />
            <TypeRadio
              label="Problem"
              description="Something wrong with the house or facilities"
              checked={reportType === "problem"}
              onChange={() => setReportType("problem")}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="grievance-subject">Subject</Label>
          <Input
            id="grievance-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary"
            maxLength={200}
          />
        </div>

        <div>
          <Label htmlFor="grievance-description">Description</Label>
          <Textarea
            id="grievance-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened or what needs attention."
            rows={6}
          />
        </div>

        <div>
          <Label>Attachments ({attachments.length}/{MAX_FILES})</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Up to {MAX_FILES} files, 10MB each. Photos or documents.
          </p>
          <div className="flex flex-wrap gap-2">
            {attachments.map((path) => (
              <div
                key={path}
                className="flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1 text-sm"
              >
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[180px] truncate">
                  {attachmentNames[path] ?? path.split("/").pop()}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((prev) => prev.filter((p) => p !== path))
                  }
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || attachments.length >= MAX_FILES}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Paperclip className="mr-2 h-3 w-3" />
              )}
              Add file
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
          {uploadError && (
            <p className="text-xs text-destructive mt-1">{uploadError}</p>
          )}
        </div>

        <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
          <Checkbox
            checked={submitAnonymously}
            onCheckedChange={(v) => setSubmitAnonymously(v === true)}
          />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Submit anonymously</p>
            <p className="text-xs text-muted-foreground">
              Your name and house will not be stored with this report.
              Admins won&apos;t be able to follow up with you directly.
            </p>
          </div>
        </label>

        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || uploading}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TypeRadio({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-[:checked]:border-foreground">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-1"
      />
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}
