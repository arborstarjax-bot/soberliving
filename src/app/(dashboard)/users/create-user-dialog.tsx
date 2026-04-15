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
import { Plus, Copy, Check } from "lucide-react";

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

  async function copyLink() {
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
        Add User
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state?.inviteLink ? "User Created" : "Create User"}
          </DialogTitle>
        </DialogHeader>

        {state?.inviteLink ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              User created successfully. Send them this link to set their
              password:
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={state.inviteLink}
                className="text-xs font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This link expires in 24 hours. The user will be prompted to create
              a new password when they click it.
            </p>
            <Button
              type="button"
              className="w-full"
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
            <div className="space-y-2">
              <Label>Role *</Label>
              <select
                name="role"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="resident">Resident</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              A temporary password will be generated. You&apos;ll get an invite
              link to share with the user so they can set their own password.
            </p>
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating…" : "Create & Get Invite Link"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
