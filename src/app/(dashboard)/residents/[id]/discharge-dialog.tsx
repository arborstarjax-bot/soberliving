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
  const [isVoluntary, setIsVoluntary] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== "active") return null;

  function handleDischarge() {
    setError(null);
    startTransition(async () => {
      const result = await dischargeResident(
        residentId,
        reason.trim() || undefined,
        isVoluntary
      );
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setReason("");
        setIsVoluntary(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setReason("");
          setIsVoluntary(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        Discharge
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discharge Resident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Marks the resident as discharged, vacates their bed, and clears
            their discipline, chore, leave, check-in, and bulletin records so
            a returning resident starts with a clean slate. Their login, intake
            documents, signed commitments, and payment receipts are preserved.
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
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-input"
              checked={isVoluntary}
              onChange={(e) => setIsVoluntary(e.target.checked)}
            />
            <span>
              <span className="font-medium">Voluntary departure</span>
              <span className="block text-xs text-muted-foreground">
                Resident left on their own (not staff-initiated). Used in the State of the House report.
              </span>
            </span>
          </label>
          <div className="text-xs text-muted-foreground">
            Discharge date: <span className="font-medium">{new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })}</span> (auto-stamped)
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
