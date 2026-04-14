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

interface Props {
  houses: { id: string; name: string }[];
}

export function StartRotationDialog({ houses }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createRotation, undefined);

  // Default to next Monday
  const getNextMonday = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 1 : 8 - day; // days until next Monday
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
          <RotateCcw className="mr-2 h-4 w-4" />
          New Rotation
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start 2-Week Rotation</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label>House *</Label>
            <select
              name="house_id"
              required
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
            This will create a 2-week rotation cycle. Any existing current
            rotation for this house will be archived. After creating, assign
            residents to chores from the rotation board.
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
