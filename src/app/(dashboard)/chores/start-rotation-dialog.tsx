"use client";

import { useActionState, useState } from "react";
import { createRotation } from "./actions";
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
import { RotateCcw } from "lucide-react";
import { getHouseToday } from "@/lib/timezone";

interface Props {
  houses: { id: string; name: string }[];
  defaultHouseId?: string | null;
}

export function StartRotationDialog({ houses, defaultHouseId }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createRotation, undefined);

  // Default to next Monday. Seed from today-in-app-tz so we don't
  // drift around the UTC midnight boundary (8 PM Eastern).
  const getNextMonday = () => {
    const [y, m, d0] = getHouseToday().split("-").map(Number);
    // Noon anchor avoids DST edge cases on setDate.
    const dt = new Date(y, m - 1, d0, 12, 0, 0, 0);
    const day = dt.getDay();
    const diff = day === 0 ? 1 : 8 - day;
    dt.setDate(dt.getDate() + diff);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
          <RotateCcw className="mr-2 h-4 w-4" />
          New Rotation
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start New Rotation</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label>House *</Label>
            <select
              name="house_id"
              required
              defaultValue={defaultHouseId ?? ""}
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
            <Label>Cycle Start Date (Monday) *</Label>
            <Input
              name="cycle_start_date"
              type="date"
              required
              defaultValue={getNextMonday()}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This will start a new rotation cycle based on each chore&apos;s
            configured cycle length. Any existing current rotation for this
            house will be archived. After creating, assign residents to chores
            from the rotation board.
          </p>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Starting…" : "Start Rotation"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
