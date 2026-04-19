"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { transferResident } from "../actions";

interface HouseOption {
  id: string;
  name: string;
}

interface Props {
  residentId: string;
  currentHouseId: string;
  residentName: string;
  houses: HouseOption[];
}

export function TransferHouseDialog({
  residentId,
  currentHouseId,
  residentName,
  houses,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetHouseId, setTargetHouseId] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const candidates = houses.filter((h) => h.id !== currentHouseId);

  function reset() {
    setTargetHouseId("");
    setConfirmed(false);
    setError(null);
    setWarning(null);
  }

  function handleSubmit() {
    setError(null);
    setWarning(null);
    if (!targetHouseId) {
      setError("Please select a target house");
      return;
    }
    if (!confirmed) {
      setError("Please confirm you understand what will be cleared");
      return;
    }
    startTransition(async () => {
      const result = await transferResident(residentId, targetHouseId, null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // Refresh the resident page either way — on the warning path the
      // resident's house_id did change, just the bed assignment didn't
      // land.
      router.refresh();
      if (result?.warning) {
        // Keep the dialog open so the user actually sees what happened
        // and knows to assign a bed manually on the new house page.
        setWarning(result.warning);
        return;
      }
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Transfer House
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer {residentName} to another house</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="target-house">Target house</Label>
            <select
              id="target-house"
              value={targetHouseId}
              onChange={(e) => setTargetHouseId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1"
            >
              <option value="">Select a house...</option>
              {candidates.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="font-medium text-amber-900">
              This will immediately clear the resident&apos;s in-flight state in
              their current house:
            </p>
            <ul className="list-disc list-inside text-amber-900 space-y-0.5 text-xs">
              <li>Active bed assignment is vacated</li>
              <li>Open sign-out is closed (signed back in now)</li>
              <li>All current &amp; upcoming chore assignments are removed</li>
              <li>Pending &amp; approved leave requests are denied</li>
              <li>Active discipline restrictions are ended</li>
              <li>Unsigned house commitments are cancelled</li>
            </ul>
            <p className="text-xs text-amber-900">
              Historical records (warnings, demerits, payment history, past
              activity) stay with the old house for compliance.
            </p>
          </div>

          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I understand this clears the resident&apos;s in-flight state in
              their current house and cannot be undone.
            </span>
          </label>

          <p className="text-xs text-muted-foreground">
            You can assign them a bed in the new house from the{" "}
            <span className="font-medium">new house page</span> after the
            transfer completes.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {warning && <p className="text-sm text-amber-700">{warning}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !targetHouseId || !confirmed}
          >
            {pending ? "Transferring..." : "Transfer Resident"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
