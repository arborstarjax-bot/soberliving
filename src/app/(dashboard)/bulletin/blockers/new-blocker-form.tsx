"use client";

import { useState, useRef, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Loader2, Paperclip } from "lucide-react";
import type { BlockerTargetType, UserRole } from "@/lib/types";
import { createBlocker, uploadBlockerAttachment } from "./actions";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

interface NewBlockerFormProps {
  houses: { id: string; name: string }[];
  residents: {
    user_id: string;
    full_name: string;
    house_id: string;
    house_name: string;
  }[];
  userRole: UserRole;
}

export function NewBlockerForm({
  houses,
  residents,
  userRole,
}: NewBlockerFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<BlockerTargetType>(
    userRole === "manager" ? "house" : "all"
  );
  const [houseIds, setHouseIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [requireSignature, setRequireSignature] = useState(true);
  const [saveToDocs, setSaveToDocs] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachmentNames, setAttachmentNames] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const canTargetAll = userRole === "admin";

  function reset() {
    setTitle("");
    setBody("");
    setTargetType(userRole === "manager" ? "house" : "all");
    setHouseIds([]);
    setUserIds([]);
    setRequireSignature(true);
    setSaveToDocs(false);
    setAttachments([]);
    setAttachmentNames({});
    setUploadError(null);
    setSubmitError(null);
  }

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
          setUploadError(
            `${file.name} exceeds 10MB limit — skipped`
          );
          continue;
        }
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadBlockerAttachment(formData);
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

  function toggleHouse(id: string) {
    setHouseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function toggleUser(id: string) {
    setUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleSubmit() {
    setSubmitError(null);
    if (!title.trim() || !body.trim()) {
      setSubmitError("Title and message are required");
      return;
    }
    if (targetType === "house" && houseIds.length === 0) {
      setSubmitError("Pick at least one house");
      return;
    }
    if (targetType === "residents" && userIds.length === 0) {
      setSubmitError("Pick at least one resident");
      return;
    }

    startTransition(async () => {
      const result = await createBlocker({
        title: title.trim(),
        body: body.trim(),
        targetType,
        targetHouseIds: houseIds,
        targetUserIds: userIds,
        attachmentPaths: attachments,
        saveToDocs,
        requireSignature,
      });
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      reset();
      setIsOpen(false);
    });
  }

  if (!isOpen) {
    return (
      <Card>
        <CardContent className="p-4">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => setIsOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Notice
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>New Notice</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            reset();
            setIsOpen(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="blocker-title">Title</Label>
          <Input
            id="blocker-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Mandatory house meeting Saturday"
            maxLength={200}
          />
        </div>
        <div>
          <Label htmlFor="blocker-body">Message</Label>
          <Textarea
            id="blocker-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What do residents need to read and acknowledge?"
            rows={5}
          />
        </div>

        <div>
          <Label>Target</Label>
          <div className="space-y-2 mt-1">
            {canTargetAll && (
              <TargetRadio
                label="Everyone"
                description="All active residents"
                checked={targetType === "all"}
                onChange={() => setTargetType("all")}
              />
            )}
            <TargetRadio
              label="Specific houses"
              description="All active residents in chosen houses"
              checked={targetType === "house"}
              onChange={() => setTargetType("house")}
            />
            <TargetRadio
              label="Specific residents"
              description="Only the residents you pick"
              checked={targetType === "residents"}
              onChange={() => setTargetType("residents")}
            />
          </div>
        </div>

        {targetType === "house" && (
          <div className="space-y-1 rounded-md border p-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Houses
            </Label>
            {houses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No houses available.
              </p>
            ) : (
              houses.map((h) => (
                <label
                  key={h.id}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={houseIds.includes(h.id)}
                    onCheckedChange={() => toggleHouse(h.id)}
                  />
                  {h.name}
                </label>
              ))
            )}
          </div>
        )}

        {targetType === "residents" && (
          <div className="space-y-1 rounded-md border p-3 max-h-60 overflow-y-auto">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Residents
            </Label>
            {residents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No residents available.
              </p>
            ) : (
              residents.map((r) => (
                <label
                  key={r.user_id}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={userIds.includes(r.user_id)}
                    onCheckedChange={() => toggleUser(r.user_id)}
                  />
                  <span className="flex-1">{r.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.house_name}
                  </span>
                </label>
              ))
            )}
          </div>
        )}

        <div>
          <Label>Attachments ({attachments.length}/{MAX_FILES})</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Up to {MAX_FILES} files, 10MB each. Residents see images
            inline and other files as download links.
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
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || attachments.length >= MAX_FILES}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-3 w-3" />
                  Add file
                </>
              )}
            </Button>
          </div>
          {uploadError && (
            <p className="mt-1 text-sm text-destructive">{uploadError}</p>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={requireSignature}
            onCheckedChange={(v) => setRequireSignature(Boolean(v))}
          />
          <span>
            Require signature to acknowledge
            <span className="block text-xs text-muted-foreground">
              When off, residents tap Continue to acknowledge. When on,
              they must draw a signature (the default).
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={saveToDocs}
            onCheckedChange={(v) => setSaveToDocs(Boolean(v))}
          />
          <span>
            Save acknowledged copy to each resident&apos;s Documents
            <span className="block text-xs text-muted-foreground">
              A signed PDF of the message + their signature will appear in their Documents.
            </span>
          </span>
        </label>

        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              setIsOpen(false);
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || uploading}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Send Notice"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TargetRadio({
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
    <label className="flex items-start gap-2 cursor-pointer text-sm">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-1"
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}
