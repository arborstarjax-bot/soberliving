"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { reinstateResident } from "../actions";
import type { ResidentStatus } from "@/lib/types";

interface House {
  id: string;
  name: string;
}

interface Props {
  residentId: string;
  status: ResidentStatus;
  houses: House[];
  currentHouseId: string;
}

export function ReinstateDialog({
  residentId,
  status,
  houses,
  currentHouseId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [houseId, setHouseId] = useState(currentHouseId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== "discharged") return null;

  function handleReinstate() {
    setError(null);
    startTransition(async () => {
      const result = await reinstateResident(residentId, houseId);
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
          setHouseId(currentHouseId);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        Reinstate
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reinstate Resident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Reinstating this resident will set them as active again and
            require them to complete a new intake application and commitment
            agreement (if required by workspace settings). They will receive
            an email to log in and complete onboarding.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reinstate_house">Assign to House</Label>
            <select
              id="reinstate_house"
              value={houseId}
              onChange={(e) => setHouseId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
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
          <Button onClick={handleReinstate} disabled={pending}>
            {pending ? "Reinstating…" : "Confirm Reinstate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
