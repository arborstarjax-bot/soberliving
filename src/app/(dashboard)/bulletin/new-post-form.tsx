"use client";

import { useActionState } from "react";
import { useState, useRef } from "react";
import { createBulletinPost, uploadBulletinPhoto } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Image as ImageIcon, Loader2 } from "lucide-react";
import type { UserRole } from "@/lib/types";

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const COMPRESSION_QUALITY = 0.7;

/** Compress and resize an image client-side using Canvas before uploading */
function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Scale down if larger than max dimensions
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);

      // Output as JPEG for compression (unless original is PNG with transparency)
      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const quality = outputType === "image/png" ? undefined : COMPRESSION_QUALITY;

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const ext = outputType === "image/png" ? "png" : "jpg";
          const compressed = new File([blob], `photo.${ext}`, { type: outputType });
          resolve(compressed);
        },
        outputType,
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

interface NewPostFormProps {
  houses: { id: string; name: string }[];
  userRole: UserRole;
  singleHouse?: boolean;
}

export function NewPostForm({ houses, userRole, singleHouse }: NewPostFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHouses, setSelectedHouses] = useState<string[]>(
    singleHouse && houses.length === 1 ? [houses[0].id] : []
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [state, action, isPending] = useActionState(
    async (prev: { error?: string } | undefined, formData: FormData) => {
      // Append house_ids and photo_url to the form data
      for (const hid of selectedHouses) {
        formData.append("house_ids", hid);
      }
      if (photoUrl) {
        formData.set("photo_url", photoUrl);
      }
      const result = await createBulletinPost(prev, formData);
      if (!result?.error) {
        setIsOpen(false);
        setSelectedHouses(singleHouse && houses.length === 1 ? [houses[0].id] : []);
        setPhotoUrl(null);
      }
      return result;
    },
    undefined
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      let fileToUpload = file;
      try {
        fileToUpload = await compressImage(file);
      } catch {
        // compression failed, use original
      }
      const fd = new FormData();
      fd.append("file", fileToUpload);
      const result = await uploadBulletinPhoto(fd);
      if (result.error) {
        setUploadError(result.error);
      } else if (result.url) {
        setPhotoUrl(result.url);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggleHouse(id: string) {
    setSelectedHouses((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  }

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        New Post
      </Button>
    );
  }

  const showHouseCheckboxes = !singleHouse && houses.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">New Post</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="Post title"
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="content">Message</Label>
            <Textarea
              id="content"
              name="content"
              placeholder="Write your message..."
              required
              rows={4}
              maxLength={5000}
            />
          </div>

          {showHouseCheckboxes && (
            <div className="space-y-2">
              <Label>Post to Houses</Label>
              <div className="flex flex-wrap gap-3">
                {houses.map((house) => (
                  <label
                    key={house.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={selectedHouses.includes(house.id)}
                      onCheckedChange={() => toggleHouse(house.id)}
                    />
                    {house.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave unchecked to post globally (visible to all houses)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Photo (optional)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="mr-2 h-4 w-4" />
                )}
                {uploading ? "Uploading..." : "Add Photo"}
              </Button>
              {photoUrl && (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt="Preview"
                    className="h-10 w-10 rounded object-cover"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => { setPhotoUrl(null); setUploadError(null); }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {uploadError && (
              <p className="text-sm text-destructive">{uploadError}</p>
            )}
          </div>

          {/* Full-size photo preview */}
          {photoUrl && (
            <div className="relative rounded-lg overflow-hidden border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt="Photo preview"
                className="max-h-64 w-full object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2 h-7 rounded-full"
                onClick={() => { setPhotoUrl(null); setUploadError(null); }}
              >
                <X className="h-3 w-3 mr-1" />
                Remove
              </Button>
            </div>
          )}

          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending || uploading}>
              {isPending ? "Posting..." : "Post"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
