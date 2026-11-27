"use client";

import { useState, useTransition } from "react";
import { setStaffIntakeCheckoff } from "./actions";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  required?: boolean;
}

/**
 * Staff-side intake checklist: managers/admins tick each workspace
 * intake step off against a specific applicant as they complete it
 * in person (paperwork, UA, rent, house walk, rules review...).
 * Checkoffs are stored on the applicant's user_id so they persist
 * with the resident record.
 */
export function IntakeChecklistPanel({
  residentUserId,
  steps,
  checkedStepIds,
}: {
  residentUserId: string;
  steps: Step[];
  checkedStepIds: string[];
}) {
  const [checked, setChecked] = useState<Set<string>>(
    new Set(checkedStepIds)
  );
  const [pending, startTransition] = useTransition();

  if (steps.length === 0) return null;
  const done = steps.filter((s) => checked.has(s.id)).length;

  const toggle = (stepId: string, next: boolean) => {
    setChecked((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(stepId);
      else copy.delete(stepId);
      return copy;
    });
    startTransition(async () => {
      await setStaffIntakeCheckoff(residentUserId, stepId, next);
    });
  };

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Intake Checklist</h3>
        <span
          className={cn(
            "text-xs font-medium",
            done === steps.length ? "text-emerald-600" : "text-muted-foreground"
          )}
        >
          {done}/{steps.length} done
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {steps.map((step) => (
          <label
            key={step.id}
            className={cn(
              "flex items-center gap-2 text-sm",
              pending && "opacity-70"
            )}
          >
            <input
              type="checkbox"
              checked={checked.has(step.id)}
              disabled={pending}
              onChange={(e) => toggle(step.id, e.target.checked)}
              className="h-4 w-4"
            />
            <span className={checked.has(step.id) ? "line-through opacity-60" : ""}>
              {step.label}
              {step.required && <span className="text-destructive"> *</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
