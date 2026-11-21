"use client";

import { useActionState, useState } from "react";
import { submitBugReport } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bug, CircleHelp, MessageSquare, Check } from "lucide-react";

const CATEGORIES = [
  { value: "bug", label: "Report a bug", icon: Bug },
  { value: "help", label: "Get help", icon: CircleHelp },
  { value: "feedback", label: "Send feedback", icon: MessageSquare },
] as const;

export function SupportForm() {
  const [state, action, pending] = useActionState(submitBugReport, undefined);
  const [category, setCategory] = useState("bug");
  // Controlled fields: an uncontrolled form resets when a failed action
  // re-renders, which used to erase the whole unsent draft on any error.
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const done = state !== undefined && !state.error && !pending;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {done ? (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-6 text-center space-y-2">
          <Check className="mx-auto h-8 w-8 text-green-500" />
          <p className="font-medium">Thanks — your report was sent.</p>
          <p className="text-sm text-muted-foreground">
            We typically reply within a day.
          </p>
        </div>
      ) : (
        <form
          action={action}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label>What do you need?</Label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-colors ${
                    category === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
            <input type="hidden" name="category" value={category} />
            <input
              type="hidden"
              name="page"
              value={typeof window !== "undefined" ? document.referrer : ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              name="subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={
                category === "bug" ? "What's broken?" : "What's it about?"
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">Details</Label>
            <textarea
              id="details"
              name="details"
              required
              rows={6}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={
                category === "bug"
                  ? "What happened, what did you expect, and the steps to reproduce it."
                  : "Tell us more."
              }
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send to support"}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Emails go straight to the operator inbox. You can also{" "}
            <a
              href="mailto:arborstarjax@gmail.com?subject=Sober%20Living%20support"
              className="underline underline-offset-2"
            >
              write to arborstarjax@gmail.com
            </a>{" "}
            directly.
          </p>
        </form>
      )}
    </div>
  );
}
