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
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";
import { updateRoom, deleteRoom } from "../actions";

interface EditRoomDialogProps {
  roomId: string;
  roomName: string;
  floor: number | null;
  bedCount: number;
  hasOccupiedBeds: boolean;
}

export function EditRoomDialog({
  roomId,
  roomName,
  floor,
  bedCount,
  hasOccupiedBeds,
}: EditRoomDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(roomName);
  const [floorVal, setFloorVal] = useState(floor?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSave() {
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    if (floorVal) fd.set("floor", floorVal);
    startTransition(async () => {
      const result = await updateRoom(roomId, fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRoom(roomId);
      if (result?.error) {
        setError(result.error);
        setConfirmDelete(false);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setName(roomName);
          setFloorVal(floor?.toString() ?? "");
          setError(null);
          setConfirmDelete(false);
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Room</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-room-name">Room Name *</Label>
            <Input
              id="edit-room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Room 1, Master Bedroom"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-room-floor">Floor</Label>
            <Input
              id="edit-room-floor"
              type="number"
              value={floorVal}
              onChange={(e) => setFloorVal(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            This room has <span className="font-medium">{bedCount}</span> bed{bedCount !== 1 ? "s" : ""}.
            Use the &quot;+ Add Bed&quot; button on the room card to add more beds.
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {!confirmDelete ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete Room
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={pending || !name.trim()}>
                {pending ? "Saving..." : "Save Changes"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-destructive flex-1">
                {hasOccupiedBeds
                  ? "Cannot delete — unassign all residents first."
                  : `Delete "${roomName}" and all its beds? This cannot be undone.`}
              </p>
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              {!hasOccupiedBeds && (
                <Button variant="destructive" onClick={handleDelete} disabled={pending}>
                  {pending ? "Deleting..." : "Confirm Delete"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
