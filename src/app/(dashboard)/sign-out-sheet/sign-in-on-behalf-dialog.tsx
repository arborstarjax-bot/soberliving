"use client";

import { useActionState, useState } from "react";
import { signInResident } from "./actions";
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
import { LogIn } from "lucide-react";

interface Props {
  signOutId: string;
  residentName: string;
  destination: string;
}

/**
 * Staff dialog to sign a resident back in on their behalf, with an
 * optional Warning or Demerit attached to the same action (e.g. a
 * late return). Residents see the self-serve button in
 * `sign-out-toggle.tsx` instead.
 */
export function SignInOnBehalfDialog({ signOutId, residentName, destination }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(signInResident, undefined);
  const [discipline, setDiscipline] = useState<"none" | "warning" | "demerit">(
    "none"
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-9">
            <LogIn className="mr-1.5 h-4 w-4" />
            Sign In
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sign In {residentName}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="sign_out_id" value={signOutId} />
          <p className="text-sm text-muted-foreground">
            Returning from <span className="font-medium text-foreground">{destination}</span>.
          </p>

          <div className="space-y-2">
            <Label>Attach discipline (optional)</Label>
            <div className="flex gap-2">
              {(["none", "warning", "demerit"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setDiscipline(opt)}
                  className={`flex-1 h-10 rounded-md border text-sm font-medium capitalize transition active:scale-95 ${
                    discipline === opt
                      ? opt === "demerit"
                        ? "border-red-500 bg-red-500/10 text-red-600"
                        : opt === "warning"
                          ? "border-yellow-500 bg-yellow-500/10 text-yellow-600"
                          : "border-foreground bg-foreground/5"
                      : "border-border bg-transparent text-muted-foreground"
                  }`}
                >
                  {opt === "none" ? "None" : opt}
                </button>
              ))}
            </div>
            <input type="hidden" name="discipline" value={discipline} />
          </div>

          {discipline !== "none" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="discipline_reason">Reason *</Label>
                <Textarea
                  id="discipline_reason"
                  name="discipline_reason"
                  rows={2}
                  required
                  maxLength={500}
                  placeholder="e.g. returned after curfew"
                />
              </div>
              {discipline === "demerit" && (
                <div className="space-y-2">
                  <Label htmlFor="demerit_points">Points</Label>
                  <Input
                    id="demerit_points"
                    name="demerit_points"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={1}
                    className="w-24"
                  />
                </div>
              )}
            </>
          )}

          {state?.error && (
            <p className="text-sm text-red-500">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign In"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
