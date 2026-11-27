"use client";

import { useActionState, useState, useTransition } from "react";
import { signOutResident, signInResident } from "./actions";
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
      <div className="rounded-2xl border-2 border-red-500 bg-red-600 p-5 text-white shadow-lg shadow-red-500/20">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-white/80">
              Currently Signed Out
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-lg font-bold truncate">
              <MapPin className="h-4 w-4 shrink-0" />
              {openSignOut.destination}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/80">
              <Clock className="h-3 w-3 shrink-0" />
              Since {new Date(openSignOut.time_out).toLocaleString(undefined, { timeZone: "America/New_York",
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
              className="h-14 min-w-[7rem] text-base font-bold bg-white text-red-700 hover:bg-white/90"
            >
              <LogIn className="mr-1.5 h-5 w-5" />
              {signInPending ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>
        {signInState?.error && (
          <p className="mt-2 text-xs font-semibold text-white bg-red-900/40 rounded px-2 py-1">
            {signInState.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            className="h-20 w-full rounded-2xl bg-green-600 text-xl font-bold text-white hover:bg-green-700 shadow-lg shadow-green-500/20 active:scale-[0.99]"
          />
        }
      >
        <LogOut className="mr-3 h-7 w-7" />
        Sign Out of House
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
          {signOutError && (
            <p className="text-sm text-red-500">{signOutError}</p>
          )}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="submit"
              disabled={signOutPending}
              className="h-14 w-full bg-green-600 text-base font-bold text-white hover:bg-green-700 shadow-lg shadow-green-500/20"
            >
              <LogOut className="mr-2 h-5 w-5" />
              {signOutPending ? "Signing out…" : "Sign Out of House"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={signOutPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
