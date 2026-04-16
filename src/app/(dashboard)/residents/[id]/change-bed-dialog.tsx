"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { changeResidentBed } from "../actions";

export interface BedOption {
  id: string;
  label: string;
  roomName: string;
  isOccupied: boolean;
  isCurrent: boolean;
}

interface Props {
  residentId: string;
  houseId: string;
  beds: BedOption[];
  currentBedLabel: string | null;
}

export function ChangeBedDialog({
  residentId,
  houseId,
  beds,
  currentBedLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("__none__");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    const bedId = selected === "__none__" ? null : selected;
    startTransition(async () => {
      const result = await changeResidentBed(residentId, bedId, houseId);
      if (result?.error) {
        setError(result.error);
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
          setError(null);
          setSelected("__none__");
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Change Bed
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Bed</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Current:{" "}
            <span className="font-medium">
              {currentBedLabel ?? "No specific bed"}
            </span>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="new-bed">New bed</Label>
            <select
              id="new-bed"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1"
            >
              <option value="__none__">
                None (private room / no specific bed)
              </option>
              {beds.map((b) => (
                <option
                  key={b.id}
                  value={b.id}
                  disabled={b.isOccupied && !b.isCurrent}
                >
                  {b.roomName} — {b.label}
                  {b.isCurrent ? " (current)" : ""}
                  {b.isOccupied && !b.isCurrent ? " (occupied)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Choosing &quot;None&quot; vacates the current bed and leaves the
              resident without a specific bed assignment.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
