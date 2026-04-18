"use client";

import { useActionState, useRef, useState } from "react";
import { createUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Copy, Check, Mail, Share2 } from "lucide-react";

interface House {
  id: string;
  name: string;
}

export function CreateUserDialog({ houses = [] }: { houses?: House[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createUser, undefined);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Web Share API is nice on iOS because it surfaces Messages, Mail,
  // AirDrop, etc. Show it alongside Copy when available.
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCopied(false);
    }
  }

  async function handleCopyLink() {
    const link = state?.inviteLink;
    if (!link) return;
    let ok = false;
    // navigator.clipboard.writeText only works in secure contexts
    // (https/localhost) and must run inside a user gesture. On the
    // iPhone hitting http://<LAN-IP>:3000 the secure-context check
    // fails silently, so fall back to the legacy execCommand path
    // which still works inside a user-gesture click handler on iOS
    // Safari — just needs a real DOM selection first.
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      window.isSecureContext
    ) {
      try {
        await navigator.clipboard.writeText(link);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok && inputRef.current) {
      const el = inputRef.current;
      try {
        el.focus();
        el.setSelectionRange(0, link.length);
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleShare() {
    const link = state?.inviteLink;
    if (!link) return;
    try {
      await navigator.share({
        title: "Sober Living invite",
        text: "Set up your Sober Living account:",
        url: link,
      });
    } catch {
      // User cancelled or share unsupported — no-op.
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
              {/* Raw <input> so we can attach a ref for the execCommand
                  fallback. Mirrors the styling of the shared Input
                  primitive. */}
              <input
                ref={inputRef}
                readOnly
                value={state.inviteLink}
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
                className={cn(
                  "flex h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  "selection:bg-primary selection:text-primary-foreground"
                )}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="flex-1"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1 h-4 w-4 text-green-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-4 w-4" />
                      Copy Link
                    </>
                  )}
                </Button>
                {canShare && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleShare}
                    className="flex-1"
                  >
                    <Share2 className="mr-1 h-4 w-4" />
                    Share
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link with the resident so they can set their password
                and log in. On mobile, you can also long-press the link above to
                copy it manually.
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
              <Label>Email *</Label>
              <Input name="email" type="email" required placeholder="resident@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input name="phone" />
            </div>
            {houses.length > 0 && (
              <div className="space-y-2">
                <Label>House (optional)</Label>
                <select
                  name="house_id"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">No house assigned</option>
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Pre-assign a house so the intake goes to the right manager.
                </p>
              </div>
            )}
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
