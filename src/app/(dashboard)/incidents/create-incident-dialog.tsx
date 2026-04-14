"use client";

import { useActionState, useState } from "react";
import { createIncident } from "./actions";
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
  residents: { id: string; full_name: string; house_id: string }[];
}

export function CreateIncidentDialog({ houses, residents }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState("");
  const [state, action, pending] = useActionState(createIncident, undefined);

  const filteredResidents = selectedHouse
    ? residents.filter((r) => r.house_id === selectedHouse)
    : residents;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
          <Plus className="mr-2 h-4 w-4" />
          Log Incident
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Incident</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label>House *</Label>
            <select
              name="house_id"
              required
              value={selectedHouse}
              onChange={(e) => setSelectedHouse(e.target.value)}
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
            <Label>Resident *</Label>
            <select
              name="resident_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select resident</option>
              {filteredResidents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Severity *</Label>
              <select
                name="severity"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input name="category" placeholder="e.g., Curfew, Behavior" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Date *</Label>
            <Input
              name="occurred_at"
              type="date"
              required
              defaultValue={new Date().toISOString().split("T")[0]}
            />
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea name="description" required rows={3} />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Logging…" : "Log Incident"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
