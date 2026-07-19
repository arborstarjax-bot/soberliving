"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Check, Copy, RefreshCw, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { resendInviteLink } from "./actions";

interface Props {
  userId: string;
  userName: string;
  email: string;
}

export function ResendInviteButton({ userId, userName, email }: Props) {
  const [open, setOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  function handleClick() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const res = await resendInviteLink(userId);
      if (res.error) {
        setError(res.error);
        setOpen(true);
        return;
      }
      setInviteLink(res.inviteLink ?? null);
      setOpen(true);
    });
  }

  async function handleCopy() {
    if (!inviteLink) return;
    let ok = false;
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      window.isSecureContext
    ) {
      try {
        await navigator.clipboard.writeText(inviteLink);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok && inputRef.current) {
      const el = inputRef.current;
      try {
        el.focus();
        el.setSelectionRange(0, inviteLink.length);
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
    if (!inviteLink) return;
    try {
      await navigator.share({
        title: "You're invited",
        text: "Set up your account:",
        url: inviteLink,
      });
    } catch {
      // cancelled / unsupported
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={pending}
      >
        <RefreshCw className={cn("mr-1 h-4 w-4", pending && "animate-spin")} />
        {pending ? "Sending…" : "Resend Invite"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {error ? "Couldn't resend invite" : "Invite Resent"}
            </DialogTitle>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A fresh invite email was sent to{" "}
                <span className="font-medium text-foreground">{email}</span>{" "}
                for{" "}
                <span className="font-medium text-foreground">{userName}</span>.
                You can also copy or share the link directly.
              </p>
              {inviteLink && (
                <div className="space-y-2">
                  <Label>Invite Link</Label>
                  <input
                    ref={inputRef}
                    readOnly
                    value={inviteLink}
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
                      onClick={handleCopy}
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
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
