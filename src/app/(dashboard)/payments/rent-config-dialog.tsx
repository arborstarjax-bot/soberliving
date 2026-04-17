"use client";

import { useActionState, useState } from "react";
import { upsertRentConfig } from "./actions";
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
import { Settings } from "lucide-react";

// Rent config is now a house-level default used to prefill the
// commitment form — the signed commitment is still the source of
// truth for each resident's actual rent schedule. Monthly-only,
// same-day-each-month cadence; we dropped late fees + grace period
// per owner decision.

interface RentConfigData {
  house_id: string;
  monthly_amount: number;
  due_day_of_month: number;
}

interface Props {
  houses: { id: string; name: string }[];
  existingConfigs: Record<string, RentConfigData>;
}

export function RentConfigDialog({ houses, existingConfigs }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState("");
  const [state, action, pending] = useActionState(upsertRentConfig, undefined);

  const currentConfig = selectedHouse ? existingConfigs[selectedHouse] : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Settings className="mr-2 h-4 w-4" />
        Rent Settings
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rent Configuration</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          House-level default used to prefill the commitment form. A resident&apos;s actual rent
          schedule comes from their signed commitment.
        </p>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Monthly Rent *</Label>
              <Input
                name="monthly_amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                defaultValue={currentConfig?.monthly_amount ?? ""}
                key={selectedHouse + "-amount"}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Due Day *</Label>
              <Input
                name="due_day_of_month"
                type="number"
                min="1"
                max="28"
                required
                defaultValue={currentConfig?.due_day_of_month ?? 1}
                key={selectedHouse + "-day"}
              />
            </div>
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Save Rent Config"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
