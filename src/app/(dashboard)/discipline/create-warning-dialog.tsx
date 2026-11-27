"use client";

import { useActionState, useState } from "react";
import { createWarning, uploadWarningPhoto } from "./warning-actions";
import { compressImage } from "@/lib/compress-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, Camera } from "lucide-react";

interface Props {
  houses: { id: string; name: string }[];
  residents: { id: string; full_name: string; house_id: string }[];
}

export function CreateWarningDialog({ houses, residents }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState("");
  const [state, action, pending] = useActionState(createWarning, undefined);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    setUploading(true);
    setUploadError(null);
    try {
      const file = await compressImage(raw);
      setPhotoFile(file);
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadWarningPhoto(fd);
      if (result.error) {
        setUploadError(result.error);
        setPhotoUrl(null);
      } else {
        setPhotoUrl(result.url ?? null);
      }
    } finally {
      setUploading(false);
    }
  }

  const filteredResidents = selectedHouse
    ? residents.filter((r) => r.house_id === selectedHouse)
    : residents;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <AlertTriangle className="mr-2 h-4 w-4" />
        Issue Warning
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue Warning</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label>House *</Label>
            <select
              name="house_id"
              required
              value={selectedHouse}
              onChange={(e) => setSelectedHouse(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select house</option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Resident *</Label>
            <select
              name="resident_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select resident</option>
              {filteredResidents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Input
              name="category"
              placeholder="e.g., Behavior, Cleanliness, Curfew, Missed Chore"
            />
          </div>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              name="reason"
              required
              rows={2}
              placeholder="What needs to be corrected?"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              name="notes"
              rows={2}
              placeholder="Additional context (optional)..."
            />
          </div>
          <div className="space-y-2">
            <Label>Photo (optional)</Label>
            <div className="flex items-center gap-2">
              <label
                htmlFor="warning-photo"
                className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                <Camera className="h-4 w-4" />
                {photoFile ? photoFile.name : "Choose photo"}
              </label>
              <input
                id="warning-photo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
              {uploading && (
                <span className="text-xs text-muted-foreground">
                  Uploading...
                </span>
              )}
            </div>
            {uploadError && (
              <p className="text-xs text-red-600">{uploadError}</p>
            )}
            {photoUrl && (
              <input type="hidden" name="photo_url" value={photoUrl} />
            )}
          </div>
          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || uploading}>
              {pending ? "Issuing..." : "Issue Warning"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
