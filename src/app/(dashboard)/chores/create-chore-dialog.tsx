"use client";

import { useActionState, useState } from "react";
import { createChore } from "./actions";
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

interface Props {
  houses: { id: string; name: string }[];
}

export function CreateChoreDialog({ houses }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createChore, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
          <Plus className="mr-2 h-4 w-4" />
          New Chore
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Chore</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chore-house">House *</Label>
            <select
              name="house_id"
              id="chore-house"
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
            <Label htmlFor="chore-name">Chore Name *</Label>
            <Input
              id="chore-name"
              name="name"
              required
              placeholder="e.g., Kitchen, Master Bathroom"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            After creating, add specific tasks from the Chore Lists tab.
          </p>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create Chore"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
