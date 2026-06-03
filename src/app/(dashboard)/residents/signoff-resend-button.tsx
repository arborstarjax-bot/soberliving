"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CheckCircle } from "lucide-react";
import { signOffResendApplication } from "./actions";

interface Props {
  userId: string;
  residentName: string;
}

export function SignOffResendButton({ userId, residentName }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSignOff() {
    setError(null);
    startTransition(async () => {
      const result = await signOffResendApplication(userId);
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
        if (!v) setError(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
        Sign Off
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign Off Application</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Confirm that you have reviewed the resent application for{" "}
          <strong>{residentName}</strong>. This will clear the pending review
          status.
        </p>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={handleSignOff} disabled={pending}>
            {pending ? "Signing off…" : "Confirm Sign Off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
