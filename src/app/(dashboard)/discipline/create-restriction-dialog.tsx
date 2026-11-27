"use client";

import { useActionState, useState } from "react";
import { createRestriction } from "./actions";
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
import { ShieldAlert } from "lucide-react";
import { getHouseToday } from "@/lib/timezone";

const RESTRICTION_TYPES = [
  { value: "no_leave", label: "No Leave" },
  { value: "no_overnight", label: "No Overnight" },
  { value: "weekend_restriction", label: "Weekend Restriction" },
  { value: "house_commitment", label: "House Commitment (New Intake)" },
  { value: "curfew", label: "Curfew" },
  { value: "custom", label: "Custom" },
];

interface Props {
  houses: { id: string; name: string }[];
  residents: { id: string; full_name: string; house_id: string }[];
}

export function CreateRestrictionDialog({ houses, residents }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState("");
  const [restrictionType, setRestrictionType] = useState("custom");
  const [state, action, pending] = useActionState(createRestriction, undefined);

  const filteredResidents = selectedHouse
    ? residents.filter((r) => r.house_id === selectedHouse)
    : residents;

  const isHouseCommitment = restrictionType === "house_commitment";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
          <ShieldAlert className="mr-2 h-4 w-4" />
          Add Restriction
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Restriction</DialogTitle>
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
          <div className="space-y-2">
            <Label>Restriction Type *</Label>
            <select
              name="restriction_type"
              required
              value={restrictionType}
              onChange={(e) => setRestrictionType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              {RESTRICTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              name="description"
              required
              rows={2}
              placeholder={
                isHouseCommitment
                  ? "e.g., New intake — cannot leave the house for 7 days"
                  : "Describe the restriction..."
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input
                name="start_date"
                type="date"
                required
                defaultValue={getHouseToday()}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input name="end_date" type="date" />
              <p className="text-[10px] text-muted-foreground">
                Leave blank for indefinite. Auto-expires on end date.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea name="notes" rows={2} placeholder="Additional notes (optional)..." />
          </div>
          {isHouseCommitment && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="is_house_commitment"
                id="is_house_commitment"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="is_house_commitment" className="text-sm font-normal">
                This is a house commitment restriction for a new intake
              </Label>
            </div>
          )}
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Adding..." : "Add Restriction"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
