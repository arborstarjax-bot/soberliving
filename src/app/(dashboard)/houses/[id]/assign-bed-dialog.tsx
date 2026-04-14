"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignBed } from "../../residents/actions";

interface AssignBedDialogProps {
  bedId: string;
  bedLabel: string;
  roomName: string;
  houseId: string;
  residents: { id: string; full_name: string }[];
}

export function AssignBedDialog({
  bedId,
  bedLabel,
  roomName,
  houseId,
  residents,
}: AssignBedDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedResident, setSelectedResident] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleAssign = () => {
    if (!selectedResident) {
      setError("Select a resident");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await assignBed(selectedResident, bedId, houseId);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setSelectedResident("");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="text-xs mt-1" />}>
          Assign Resident
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Assign Bed — {roomName} / {bedLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Resident</Label>
            <Select
              value={selectedResident}
              onValueChange={(val) => setSelectedResident(val ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select resident" />
              </SelectTrigger>
              <SelectContent>
                {residents.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            onClick={handleAssign}
            className="w-full"
            disabled={isPending}
          >
            {isPending ? "Assigning…" : "Assign Bed"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
