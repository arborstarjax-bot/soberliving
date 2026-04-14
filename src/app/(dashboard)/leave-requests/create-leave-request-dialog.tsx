"use client";

import { useActionState, useState } from "react";
import { createLeaveRequest } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import type { UserRole } from "@/lib/types";

interface Props {
  residents: { id: string; full_name: string; house_id: string }[];
  userRole: UserRole;
  userId: string;
}

export function CreateLeaveRequestDialog({ residents }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createLeaveRequest, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
          <Plus className="mr-2 h-4 w-4" />
          New Request
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave Request</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label>Resident *</Label>
            <select
              name="resident_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select resident</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Departure Date *</Label>
              <Input name="departure_date" type="date" required />
            </div>
            <div className="space-y-2">
              <Label>Return Date *</Label>
              <Input name="expected_return_date" type="date" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea name="reason" rows={2} />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Submitting…" : "Submit Request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
