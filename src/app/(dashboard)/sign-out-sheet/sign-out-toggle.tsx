"use client";

import { useActionState, useState, useTransition } from "react";
import { signOutResident, signInResident } from "./actions";
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
import { LogOut, LogIn, MapPin, Clock } from "lucide-react";

interface OpenSignOut {
  id: string;
  destination: string;
  time_out: string;
}

interface Props {
  residentId: string;
  residentName: string;
  openSignOut: OpenSignOut | null;
}

/**
 * Prominent dashboard toggle for a resident to sign out / sign back
 * in. When currently out, shows destination + how long they've been
 * out with a one-tap Sign In button. When in, shows a large Sign Out
 * button that opens a dialog for a free-text destination.
 *
 * Staff-on-behalf interactions happen on the /sign-out-sheet list
 * page — this component is resident-self-only.
 */
export function SignOutToggle({ residentId, residentName, openSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | undefined>(undefined);
  const [signOutPending, startSignOut] = useTransition();
  const [signInState, signInAction, signInPending] = useActionState(
    signInResident,
    undefined
  );

  // Sign-out uses useTransition + manual state instead of
  // useActionState so the dialog can close exactly when the server
  // action resolves successfully — without triggering the
  // "setState in effect" lint rule. On error, the dialog stays open
  // with the error surfaced inline.
  function handleSignOut(formData: FormData) {
    startSignOut(async () => {
      const result = await signOutResident(undefined, formData);
      if (result?.error) {
        setSignOutError(result.error);
      } else {
        setSignOutError(undefined);
        setOpen(false);
      }
    });
  }

  if (openSignOut) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
              Currently Signed Out
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-base font-semibold truncate">
              <MapPin className="h-4 w-4 shrink-0" />
              {openSignOut.destination}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              Since {new Date(openSignOut.time_out).toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
          <form action={signInAction}>
            <input type="hidden" name="sign_out_id" value={openSignOut.id} />
            <Button
              type="submit"
              disabled={signInPending}
              className="h-11 min-w-[6.5rem] bg-green-600 hover:bg-green-700 text-white"
            >
              <LogIn className="mr-1.5 h-4 w-4" />
              {signInPending ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>
        {signInState?.error && (
          <p className="mt-2 text-xs text-red-500">{signInState.error}</p>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            className="h-14 w-full bg-green-600 text-base font-semibold text-white hover:bg-green-700"
          />
        }
      >
        <LogOut className="mr-2 h-5 w-5" />
        Sign Out
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sign Out</DialogTitle>
        </DialogHeader>
        <form action={handleSignOut} className="space-y-4">
          <input type="hidden" name="resident_id" value={residentId} />
          <p className="text-sm text-muted-foreground">
            {residentName}, where are you headed? Staff will be notified you&apos;re out.
          </p>
          <div className="space-y-2">
            <Label htmlFor="destination">Destination *</Label>
            <Input
              id="destination"
              name="destination"
              required
              maxLength={300}
              autoComplete="off"
              placeholder="Work, meeting, doctor, store…"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" rows={2} maxLength={1000} />
          </div>
          {signOutError && (
            <p className="text-sm text-red-500">{signOutError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={signOutPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {signOutPending ? "Signing out…" : "Sign Out"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
