"use client";

import { useActionState, useState, useMemo } from "react";
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

interface Props {
  residents: { id: string; full_name: string; house_id: string }[];
  userRole: string;
  userId: string;
  userResidentId?: string;
}

export function CreateLeaveRequestDialog({ residents, userRole, userResidentId }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createLeaveRequest, undefined);
  const [selectedResidentId, setSelectedResidentId] = useState(userResidentId ?? "");

  // Filter covering residents to same house only
  const selectedResident = residents.find((r) => r.id === selectedResidentId);
  const sameHouseResidents = useMemo(() => {
    if (!selectedResident) return [];
    return residents.filter(
      (r) => r.house_id === selectedResident.house_id && r.id !== selectedResidentId
    );
  }, [residents, selectedResident, selectedResidentId]);

  // For residents, auto-select themselves
  const availableResidents = userRole === "resident" && userResidentId
    ? residents.filter((r) => r.id === userResidentId)
    : residents;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        New Request
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>Overnight Pass / Leave Request</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label>Resident *</Label>
            <select
              name="resident_id"
              required
              value={selectedResidentId}
              onChange={(e) => setSelectedResidentId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select resident</option>
              {availableResidents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Covering Resident (same house) *</Label>
            <select
              name="covering_resident_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              disabled={!selectedResidentId}
            >
              <option value="">
                {!selectedResidentId
                  ? "Select a resident first"
                  : sameHouseResidents.length === 0
                  ? "No other residents in this house"
                  : "Select covering resident"}
              </option>
              {sameHouseResidents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The covering resident must approve before the request proceeds.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Reason for Pass</Label>
            <Textarea name="reason_for_pass" rows={2} placeholder="Why are you requesting leave?" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Leaving Date/Time *</Label>
              <Input
                name="leaving_datetime"
                type="datetime-local"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Returning Date/Time *</Label>
              <Input
                name="returning_datetime"
                type="datetime-local"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Transportation</Label>
            <Input name="transportation" placeholder="e.g., Personal vehicle, rideshare" />
          </div>

          <div className="space-y-2">
            <Label>Companion(s)</Label>
            <Input name="companion" placeholder="Who are you going with?" />
          </div>

          <div className="space-y-2">
            <Label>Destination Address</Label>
            <Input name="destination_address" placeholder="Where are you going?" />
          </div>

          <div className="space-y-2">
            <Label>General Reason</Label>
            <Textarea name="reason" rows={2} />
          </div>

          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Approval Flow:</p>
            <p>1. Covering resident approves</p>
            <p>2. House manager approves</p>
            <p>3. Admin gives final approval</p>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Submitting…" : "Submit Request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
