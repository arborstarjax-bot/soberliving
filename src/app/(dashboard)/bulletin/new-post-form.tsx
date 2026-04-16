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
    const fd = new FormData();
    fd.append("file", file);
    const result = await uploadBulletinPhoto(fd);
    setUploading(false);
    if (result.url) {
      setPhotoUrl(result.url);
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
                    onClick={() => setPhotoUrl(null)}
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
          </div>

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
