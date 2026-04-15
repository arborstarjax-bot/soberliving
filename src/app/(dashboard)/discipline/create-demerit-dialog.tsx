"use client";

import { useActionState, useState } from "react";
import { createDemerit, uploadDemeritPhoto } from "./actions";
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
import { Plus, Camera } from "lucide-react";

interface Props {
  houses: { id: string; name: string }[];
  residents: { id: string; full_name: string; house_id: string }[];
}

export function CreateDemeritDialog({ houses, residents }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState("");
  const [state, action, pending] = useActionState(createDemerit, undefined);
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
      const result = await uploadDemeritPhoto(fd);
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
      <DialogTrigger render={<Button />}>
          <Plus className="mr-2 h-4 w-4" />
          Issue Demerit
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue Demerit</DialogTitle>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Points *</Label>
              <Input name="points" type="number" min={1} max={10} defaultValue={1} required />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input name="category" placeholder="e.g., Chores, Behavior" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea name="reason" required rows={2} placeholder="Describe the infraction..." />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} placeholder="Additional notes (optional)..." />
          </div>
          <div className="space-y-2">
            <Label>Photo (optional)</Label>
            <div className="flex items-center gap-2">
              <label
                htmlFor="demerit-photo"
                className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                <Camera className="h-4 w-4" />
                {photoFile ? photoFile.name : "Choose photo"}
              </label>
              <input
                id="demerit-photo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
              {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
              {photoUrl && <span className="text-xs text-green-600">Uploaded</span>}
            </div>
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            {photoUrl && <input type="hidden" name="photo_url" value={photoUrl} />}
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending || uploading}>
            {pending ? "Issuing…" : "Issue Demerit"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
