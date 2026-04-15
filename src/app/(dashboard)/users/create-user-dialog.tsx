"use client";

import { useActionState, useState } from "react";
import { createUser } from "./actions";
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
import { Plus, Copy, Check, Mail } from "lucide-react";

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createUser, undefined);
  const [copied, setCopied] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCopied(false);
    }
  }

  async function handleCopyLink() {
    if (state?.inviteLink) {
      await navigator.clipboard.writeText(state.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        New Resident
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state?.inviteLink ? "Invite Sent!" : "Add Resident"}
          </DialogTitle>
        </DialogHeader>

        {state?.inviteLink ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Mail className="h-4 w-4" />
              <span>An invite email has been sent to the resident.</span>
            </div>
            <div className="space-y-2">
              <Label>Invite Link</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={state.inviteLink}
                  className="text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link with the resident so they can set their password
                and log in.
              </p>
            </div>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input name="full_name" required />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input name="phone" />
            </div>
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending Invite…" : "Send Invite"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
