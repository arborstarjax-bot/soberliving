"use client";

import { useActionState, useState } from "react";
import { createRoom } from "../actions";
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

export function AddRoomDialog({ houseId }: { houseId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createRoom, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus className="mr-2 h-4 w-4" />
          Add Room
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Room</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="house_id" value={houseId} />
          <div className="space-y-2">
            <Label htmlFor="room-name">Room Name *</Label>
            <Input
              id="room-name"
              name="name"
              placeholder="e.g., Room 1, Master Bedroom"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="floor">Floor</Label>
            <Input
              id="floor"
              name="floor"
              type="number"
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bed-count">Number of Beds</Label>
            <Input
              id="bed-count"
              name="bed_count"
              type="number"
              min={0}
              max={20}
              placeholder="e.g., 2"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Adding…" : "Add Room"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
