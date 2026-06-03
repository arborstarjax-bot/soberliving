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
import { FileText } from "lucide-react";
import { resendApplicationToResident } from "./actions";

interface Props {
  residentId: string;
  residentName: string;
}

export function ResendApplicationButton({ residentId, residentName }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await resendApplicationToResident(residentId);
      if (result?.error) {
        setError(result.error);
      } else {
        setSent(true);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setError(null);
          setSent(false);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FileText className="mr-1.5 h-3.5 w-3.5" />
        Resend Application
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resend Application</DialogTitle>
        </DialogHeader>
        {sent ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-green-600">
              Application sent to {residentName}. They will need to complete the
              intake form before they can access the full app.
            </p>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This will reset <strong>{residentName}&apos;s</strong> intake
              status and send them an email to complete the full application.
              They will not be able to use the app until they finish.
            </p>
            <p className="text-sm text-muted-foreground">
              Their existing commitment agreement will also need to be
              re-completed after the application is approved.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={pending}>
                {pending ? "Sending…" : "Send Application"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
