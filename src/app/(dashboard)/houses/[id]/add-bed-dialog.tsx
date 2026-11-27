"use client";

import { useActionState, useState } from "react";
import { createBed } from "../actions";
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
import { Plus } from "lucide-react";

export function AddBedDialog({
  roomId,
}: {
  roomId: string;
  houseId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createBed, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
          <Plus className="mr-1 h-3 w-3" />
          Bed
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Bed</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="room_id" value={roomId} />
          <div className="space-y-2">
            <Label htmlFor="bed-label">Bed Label *</Label>
            <Input
              id="bed-label"
              name="label"
              placeholder="e.g., Bed A, Left, Top Bunk"
              required
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Adding…" : "Add Bed"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
