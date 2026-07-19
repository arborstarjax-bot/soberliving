"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { updateHouse } from "./actions";

interface EditHouseDialogProps {
  houseId: string;
  currentName: string;
  currentAddress?: string | null;
  currentPhone?: string | null;
}

export function EditHouseDialog({
  houseId,
  currentName,
  currentAddress,
  currentPhone,
}: EditHouseDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateHouse(houseId, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" />}>
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit House</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-house-name">House Name *</Label>
            <Input
              id="edit-house-name"
              name="name"
              defaultValue={currentName}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-house-address">Address</Label>
            <Input
              id="edit-house-address"
              name="address"
              defaultValue={currentAddress ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-house-phone">Phone</Label>
            <Input
              id="edit-house-phone"
              name="phone"
              defaultValue={currentPhone ?? ""}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
