"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { dischargeResident } from "../actions";
import type { ResidentStatus } from "@/lib/types";

interface Props {
  residentId: string;
  status: ResidentStatus;
}

export function DischargeDialog({ residentId, status }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== "active") return null;

  function handleDischarge() {
    setError(null);
    startTransition(async () => {
      const result = await dischargeResident(residentId, reason.trim() || undefined);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setReason("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setReason(""); setError(null); } }}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        Discharge
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discharge Resident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            This will mark the resident as discharged, vacate all bed assignments, and auto-stamp today as the discharge date.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="discharge_reason">Reason for Discharge</Label>
            <Textarea
              id="discharge_reason"
              placeholder="e.g. Completed program, Voluntary leave, Rule violation..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Discharge date: <span className="font-medium">{new Date().toLocaleDateString()}</span> (auto-stamped)
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDischarge} disabled={pending}>
            {pending ? "Discharging..." : "Confirm Discharge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
