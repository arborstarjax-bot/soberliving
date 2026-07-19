"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { sendCheckIn } from "@/app/(dashboard)/check-ins/actions";
import { Send } from "lucide-react";

interface House {
  id: string;
  name: string;
}

interface SendCheckInDialogProps {
  houses: House[];
}

export function SendCheckInDialog({ houses }: SendCheckInDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedHouseIds, setSelectedHouseIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();

  function toggleHouse(houseId: string) {
    setSelectedHouseIds((prev) =>
      prev.includes(houseId)
        ? prev.filter((id) => id !== houseId)
        : [...prev, houseId]
    );
  }

  function toggleAll() {
    if (selectedHouseIds.length === houses.length) {
      setSelectedHouseIds([]);
    } else {
      setSelectedHouseIds(houses.map((h) => h.id));
    }
  }

  function handleSend() {
    setError(null);
    setSuccess(null);

    if (selectedHouseIds.length === 0) {
      setError("Please select at least one house.");
      return;
    }

    startSending(async () => {
      const result = await sendCheckIn(selectedHouseIds);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(
          `Check-in sent to ${result.count} resident(s). They will be required to complete it before accessing the app.`
        );
        setTimeout(() => {
          setOpen(false);
          setSelectedHouseIds([]);
          setSuccess(null);
        }, 2000);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Send className="h-4 w-4 mr-1.5" />
        Send Check-In
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Monthly Check-In</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Select which houses to send the check-in to. All active residents in
          the selected houses will be required to complete the check-in before
          they can access the app.
        </p>

        <div className="space-y-2 mt-4">
          {houses.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              className={`w-full text-left px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                selectedHouseIds.length === houses.length
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-input"
              }`}
            >
              All Houses
            </button>
          )}
          {houses.map((house) => (
            <button
              key={house.id}
              type="button"
              onClick={() => toggleHouse(house.id)}
              className={`w-full text-left px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                selectedHouseIds.includes(house.id)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-input"
              }`}
            >
              {house.name}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">
            {error}
          </p>
        )}

        {success && (
          <p className="text-sm text-green-700 bg-green-50 p-2 rounded-md">
            {success}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isSending || !!success}>
            {isSending ? "Sending..." : "Send Check-In"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
