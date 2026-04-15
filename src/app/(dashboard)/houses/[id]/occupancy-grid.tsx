"use client";

import { useActionState, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type { UserRole } from "@/lib/types";
import { AddBedDialog } from "./add-bed-dialog";
import { AssignBedDialog } from "./assign-bed-dialog";
import { updateRoom, deleteRoom, updateBed, deleteBed, reorderRooms } from "../actions";
import { vacateBed } from "../../residents/actions";
import { Pencil, Trash2, ArrowUp, ArrowDown, UserX } from "lucide-react";

interface BedAssignment {
  id: string;
  end_date: string | null;
  resident: { id: string; full_name: string; status: string } | null;
}

interface BedData {
  id: string;
  label: string;
  is_active: boolean;
  bed_assignments: BedAssignment[];
}

interface RoomData {
  id: string;
  name: string;
  floor: number | null;
  sort_order?: number;
  beds: BedData[];
}

interface ResidentOption {
  id: string;
  full_name: string;
}

interface OccupancyGridProps {
  rooms: RoomData[];
  houseId: string;
  residents: ResidentOption[];
  userRole: UserRole;
}

export function OccupancyGrid({
  rooms,
  houseId,
  residents,
  userRole,
}: OccupancyGridProps) {
  const canManage = userRole === "admin" || userRole === "manager";
  const [isPending, startTransition] = useTransition();

  function moveRoom(index: number, direction: "up" | "down") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rooms.length) return;
    const reordered = [...rooms];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    const roomIds = reordered.map((r) => r.id);
    startTransition(() => {
      reorderRooms(houseId, roomIds);
    });
  }

  if (rooms.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No rooms yet. Add a room to start managing occupancy.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {rooms.map((room, index) => (
        <Card key={room.id} className={isPending ? "opacity-70" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {canManage && rooms.length > 1 && (
                  <span className="flex flex-col gap-0.5 mr-1">
                    <button
                      onClick={() => moveRoom(index, "up")}
                      disabled={index === 0 || isPending}
                      className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveRoom(index, "down")}
                      disabled={index === rooms.length - 1 || isPending}
                      className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
                {room.name}
                {room.floor != null && (
                  <span className="text-muted-foreground font-normal ml-2">
                    Floor {room.floor}
                  </span>
                )}
                {canManage && (
                  <span className="flex items-center gap-1 ml-2">
                    <EditRoomDialog
                      roomId={room.id}
                      currentName={room.name}
                      currentFloor={room.floor}
                    />
                    <DeleteRoomButton roomId={room.id} roomName={room.name} />
                  </span>
                )}
              </CardTitle>
              {canManage && <AddBedDialog roomId={room.id} houseId={houseId} />}
            </div>
          </CardHeader>
          <CardContent>
            {room.beds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No beds in this room
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {room.beds
                  .filter((bed) => bed.is_active)
                  .map((bed) => {
                    const activeAssignment = bed.bed_assignments.find(
                      (ba) => !ba.end_date
                    );
                    const isOccupied = !!activeAssignment;

                    return (
                      <div
                        key={bed.id}
                        className={`rounded-lg border p-3 ${
                          isOccupied
                            ? "border-primary/30 bg-primary/5"
                            : "border-dashed border-muted-foreground/30"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium flex items-center gap-1">
                            {bed.label}
                            {canManage && (
                              <span className="flex items-center gap-0.5 ml-1">
                                <EditBedDialog
                                  bedId={bed.id}
                                  currentLabel={bed.label}
                                />
                                <DeleteBedButton
                                  bedId={bed.id}
                                  bedLabel={bed.label}
                                />
                              </span>
                            )}
                          </span>
                          <Badge
                            variant={isOccupied ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {isOccupied ? "Occupied" : "Available"}
                          </Badge>
                        </div>
                        {isOccupied && activeAssignment?.resident ? (
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                              {activeAssignment.resident.full_name}
                            </p>
                            {canManage && (
                              <UnassignBedButton
                                assignmentId={activeAssignment.id}
                                residentName={activeAssignment.resident.full_name}
                                bedLabel={bed.label}
                              />
                            )}
                          </div>
                        ) : canManage ? (
                          <AssignBedDialog
                            bedId={bed.id}
                            bedLabel={bed.label}
                            roomName={room.name}
                            houseId={houseId}
                            residents={residents}
                          />
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Edit Room Dialog ────────────────────────────────────────

function EditRoomDialog({
  roomId,
  currentName,
  currentFloor,
}: {
  roomId: string;
  currentName: string;
  currentFloor: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateRoom, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <button
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Edit room"
        />
      }>
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Room</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="room_id" value={roomId} />
          <div className="space-y-2">
            <Label htmlFor={`edit-room-name-${roomId}`}>Room Name *</Label>
            <Input
              id={`edit-room-name-${roomId}`}
              name="name"
              defaultValue={currentName}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-room-floor-${roomId}`}>Floor</Label>
            <Input
              id={`edit-room-floor-${roomId}`}
              name="floor"
              type="number"
              defaultValue={currentFloor ?? ""}
              placeholder="Optional"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Room Button ──────────────────────────────────────

function DeleteRoomButton({
  roomId,
  roomName,
}: {
  roomId: string;
  roomName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteRoom, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <button
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
          title="Delete room"
        />
      }>
        <Trash2 className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Room</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete <strong>{roomName}</strong> and all its
          beds? This action cannot be undone.
        </p>
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        <form action={action}>
          <input type="hidden" name="room_id" value={roomId} />
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Bed Dialog ─────────────────────────────────────────

function EditBedDialog({
  bedId,
  currentLabel,
}: {
  bedId: string;
  currentLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateBed, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <button
          className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Edit bed"
        />
      }>
        <Pencil className="h-3 w-3" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Bed</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="bed_id" value={bedId} />
          <div className="space-y-2">
            <Label htmlFor={`edit-bed-label-${bedId}`}>Bed Label *</Label>
            <Input
              id={`edit-bed-label-${bedId}`}
              name="label"
              defaultValue={currentLabel}
              required
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Bed Button ───────────────────────────────────────

function DeleteBedButton({
  bedId,
  bedLabel,
}: {
  bedId: string;
  bedLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteBed, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <button
          className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
          title="Delete bed"
        />
      }>
        <Trash2 className="h-3 w-3" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Bed</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete bed <strong>{bedLabel}</strong>? This
          action cannot be undone.
        </p>
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        <form action={action}>
          <input type="hidden" name="bed_id" value={bedId} />
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Unassign Bed Button ─────────────────────────────────────

function UnassignBedButton({
  assignmentId,
  residentName,
  bedLabel,
}: {
  assignmentId: string;
  residentName: string;
  bedLabel: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleUnassign() {
    if (
      confirm(
        `Unassign ${residentName} from ${bedLabel}? They can be reassigned to another bed.`
      )
    ) {
      startTransition(() => {
        vacateBed(assignmentId);
      });
    }
  }

  return (
    <button
      type="button"
      onClick={handleUnassign}
      disabled={isPending}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
      title={`Unassign ${residentName}`}
    >
      <UserX className="h-3 w-3" />
      {isPending ? "…" : "Unassign"}
    </button>
  );
}
