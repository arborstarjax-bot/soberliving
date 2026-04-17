"use client";

import { useActionState, useState } from "react";
import { createResident } from "./actions";
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

interface Props {
  houses: { id: string; name: string }[];
}

export function CreateResidentDialog({ houses }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createResident, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
          <Plus className="mr-2 h-4 w-4" />
          Add Resident
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>New Resident Intake</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="house_id">House *</Label>
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
            <Label htmlFor="full_name">Full Name *</Label>
            <Input id="full_name" name="full_name" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input id="date_of_birth" name="date_of_birth" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="move_in_date">Move-in Date *</Label>
              <Input
                id="move_in_date"
                name="move_in_date"
                type="date"
                required
                defaultValue={new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sobriety_date">Sobriety Date</Label>
            <Input
              id="sobriety_date"
              name="sobriety_date"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Emergency Contact</p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="emergency_contact_name">Name *</Label>
                <Input
                  id="emergency_contact_name"
                  name="emergency_contact_name"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="emergency_contact_phone">Phone *</Label>
                  <Input
                    id="emergency_contact_phone"
                    name="emergency_contact_phone"
                    type="tel"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergency_contact_relationship">
                    Relationship
                  </Label>
                  <Input
                    id="emergency_contact_relationship"
                    name="emergency_contact_relationship"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Intake Notes</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>

          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create Resident"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
