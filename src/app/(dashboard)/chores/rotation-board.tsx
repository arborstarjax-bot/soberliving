"use client";

import { useState, useTransition, useActionState } from "react";
import { assignRotationChore, unassignRotationChore, rotateSchedule, markSignoffComplete, reviewSignoff, overrideSignoffStatus } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ALL_DAYS, DAY_LABELS } from "@/lib/validations";
import { X, RefreshCw, Check, XCircle, Pencil } from "lucide-react";

interface RotationAssignment {
  id: string;
  chore_id: string;
  resident_id: string;
  chore: { id: string; name: string; days_of_week?: string[]; cycle_weeks?: number } | null;
  resident: { id: string; full_name: string } | null;
  chore_signoffs: Array<{
    id: string;
    day_of_week: string;
    week_number: number;
    status: string;
    sign_off_date: string;
    rejection_note?: string | null;
  }>;
}

interface Props {
  rotation: {
    id: string;
    house_id: string;
    cycle_start_date: string;
    cycle_end_date: string;
  };
  houseName: string;
  chores: Array<{ id: string; name: string; house_id: string; days_of_week?: string[]; cycle_weeks?: number }>;
  residents: Array<{ id: string; full_name: string }>;
  assignments: RotationAssignment[];
  isStaff: boolean;
  userRole: string;
  userResidentId?: string | null;
}

function getCurrentWeekNumber(cycleStartDate: string): number {
  const start = new Date(cycleStartDate + "T00:00:00");
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(diffDays / 7) + 1;
  return Math.max(1, weekNum);
}

function getTodayDayOfWeek(): string {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[new Date().getDay()];
}

export function RotationBoard({
  rotation,
  houseName,
  chores,
  residents,
  assignments,
  isStaff,
  userRole,
  userResidentId,
}: Props) {
  const currentWeek = getCurrentWeekNumber(rotation.cycle_start_date);
  const todayDay = getTodayDayOfWeek();

  // Determine the max cycle weeks across all chores in this house
  const maxCycleWeeks = chores.length > 0
    ? Math.max(...chores.map((c) => c.cycle_weeks ?? 2))
    : 2;

  // Clamp current week to the cycle range
  const displayWeek = Math.min(currentWeek, maxCycleWeeks);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{houseName}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {new Date(rotation.cycle_start_date).toLocaleDateString()} —{" "}
              {new Date(rotation.cycle_end_date).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isStaff && assignments.length >= 2 && (
              <RotateButton rotationId={rotation.id} />
            )}
            <Badge variant="outline">
              Week {displayWeek} of {maxCycleWeeks}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead>
              <tr>
                <th className="border p-2 text-left bg-muted min-w-[180px]">
                  Chore
                </th>
                <th className="border p-2 text-left bg-muted min-w-[160px]">
                  Assigned To
                </th>
                {ALL_DAYS.map((day) => (
                  <th
                    key={day}
                    className={`border p-2 text-center bg-muted text-xs ${day === todayDay ? "bg-primary/10 font-bold" : ""}`}
                  >
                    {DAY_LABELS[day]}
                    {day === todayDay && <span className="block text-[10px] text-primary">Today</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chores.map((chore) => {
                const assignment = assignments.find(
                  (a) => a.chore_id === chore.id
                );
                const choreDays: string[] = chore.days_of_week ?? ["monday", "wednesday", "friday"];

                return (
                  <tr key={chore.id}>
                    <td className="border p-2 font-medium">{chore.name}</td>
                    <td className="border p-2">
                      {assignment ? (
                        <div className="flex items-center gap-1">
                          <span className="flex-1">{assignment.resident?.full_name}</span>
                          {isStaff && (
                            <UnassignButton assignmentId={assignment.id} />
                          )}
                        </div>
                      ) : (
                        <AssignResidentInline
                          rotationId={rotation.id}
                          choreId={chore.id}
                          residents={residents}
                        />
                      )}
                    </td>
                    {ALL_DAYS.map((day) => {
                      const isScheduled = choreDays.includes(day);
                      if (!isScheduled) {
                        return (
                          <td
                            key={`${chore.id}-${day}`}
                            className="border p-2 text-center bg-muted/30"
                          />
                        );
                      }
                      const choreDisplayWeek = Math.min(currentWeek, chore.cycle_weeks ?? 2);
                      const signoff = assignment?.chore_signoffs?.find(
                        (s) =>
                          s.week_number === choreDisplayWeek &&
                          s.day_of_week === day
                      );

                      const isToday = day === todayDay;
                      const isOwnChore = userResidentId === assignment?.resident_id;
                      // Residents can only check off today's chore; staff can check off any day
                      const canCheckOff = signoff && signoff.status === "pending" && (
                        isStaff || (userRole === "resident" && isOwnChore && isToday)
                      );

                      const canVerify = signoff && signoff.status === "completed_pending_review" && isStaff;
                      // Staff can override any non-pending signoff status
                      const canOverride = signoff && signoff.status !== "pending" && isStaff && !canVerify;

                      return (
                        <td
                          key={`${chore.id}-${day}`}
                          className={`border p-2 text-center ${day === todayDay ? "bg-primary/5" : ""}`}
                        >
                          {canVerify ? (
                            <VerifyButtons signoffId={signoff.id} />
                          ) : canCheckOff ? (
                            <SignoffButton signoffId={signoff.id} />
                          ) : canOverride ? (
                            <StaffOverrideBadge signoffId={signoff.id} status={signoff.status} rejectionNote={signoff.rejection_note} />
                          ) : (
                            <SignoffBadge status={signoff?.status} rejectionNote={signoff?.rejection_note} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function UnassignButton({ assignmentId }: { assignmentId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      title="Unassign"
      onClick={() => {
        if (confirm("Unassign this chore? All signoff records will be removed.")) {
          startTransition(() => {
            unassignRotationChore(assignmentId);
          });
        }
      }}
    >
      {pending ? <span className="text-xs">…</span> : <X className="h-3 w-3" />}
    </button>
  );
}

function RotateButton({ rotationId }: { rotationId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm("Rotate all chore assignments? This will shift residents by one position and reset signoffs.")) {
          startTransition(() => {
            rotateSchedule(rotationId);
          });
        }
      }}
    >
      <RefreshCw className={`h-4 w-4 mr-1 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Rotating…" : "Rotate"}
    </Button>
  );
}

function SignoffButton({ signoffId }: { signoffId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="inline-flex items-center justify-center h-7 w-7 rounded-full border-2 border-dashed border-primary/40 text-primary/60 hover:border-primary hover:text-primary hover:bg-primary/10 transition-colors text-xs"
        title="Mark as done"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await markSignoffComplete(signoffId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "…" : "✓"}
      </button>
      {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
    </div>
  );
}

function VerifyButtons({ signoffId }: { signoffId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  return (
    <div className="flex flex-col items-center gap-1">
      {showRejectNote ? (
        <div className="flex flex-col gap-1 w-full">
          <input
            type="text"
            placeholder="Rejection reason…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            className="h-7 rounded border border-input bg-transparent px-2 text-xs w-full"
            autoFocus
          />
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              disabled={pending}
              className="text-xs px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await reviewSignoff(signoffId, "reject", rejectNote || undefined);
                  if (result?.error) setError(result.error);
                  else { setShowRejectNote(false); setRejectNote(""); }
                });
              }}
            >
              {pending ? "…" : "Reject"}
            </button>
            <button
              type="button"
              className="text-xs px-2 py-0.5 rounded border border-input hover:bg-muted transition-colors"
              onClick={() => { setShowRejectNote(false); setRejectNote(""); }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={pending}
            className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
            title="Approve"
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await reviewSignoff(signoffId, "approve");
                if (result?.error) setError(result.error);
              });
            }}
          >
            {pending ? "…" : <Check className="h-3 w-3" />}
          </button>
          <button
            type="button"
            disabled={pending}
            className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            title="Reject"
            onClick={() => setShowRejectNote(true)}
          >
            <XCircle className="h-3 w-3" />
          </button>
        </div>
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

function AssignResidentInline({
  rotationId,
  choreId,
  residents,
}: {
  rotationId: string;
  choreId: string;
  residents: Array<{ id: string; full_name: string }>;
}) {
  const [, action, pending] = useActionState(
    assignRotationChore,
    undefined
  );

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="rotation_id" value={rotationId} />
      <input type="hidden" name="chore_id" value={choreId} />
      <select
        name="resident_id"
        required
        className="h-7 rounded border border-input bg-transparent px-1 text-xs flex-1"
      >
        <option value="">Assign…</option>
        {residents.map((r) => (
          <option key={r.id} value={r.id}>
            {r.full_name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="ghost" disabled={pending} className="h-7 px-2 text-xs">
        {pending ? "…" : "→"}
      </Button>
    </form>
  );
}

function StaffOverrideBadge({ signoffId, status, rejectionNote }: { signoffId: string; status: string; rejectionNote?: string | null }) {
  const [pending, startTransition] = useTransition();
  const [showMenu, setShowMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusOptions: Array<{ value: "pending" | "approved" | "rejected" | "missed"; label: string }> = [
    { value: "pending", label: "Reset to Pending" },
    { value: "approved", label: "Mark Approved" },
    { value: "rejected", label: "Mark Rejected" },
    { value: "missed", label: "Mark Missed" },
  ].filter((o) => o.value !== status) as Array<{ value: "pending" | "approved" | "rejected" | "missed"; label: string }>;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="group relative cursor-pointer"
        title="Click to change status"
        onClick={() => setShowMenu(!showMenu)}
      >
        <SignoffBadge status={status} rejectionNote={rejectionNote} />
        <span className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-white">
          <Pencil className="h-2 w-2" />
        </span>
      </button>
      {showMenu && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg py-1 min-w-[140px]">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={pending}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await overrideSignoffStatus(signoffId, opt.value);
                  if (result?.error) setError(result.error);
                  setShowMenu(false);
                });
              }}
            >
              {pending ? "…" : opt.label}
            </button>
          ))}
          <button
            type="button"
            className="block w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors border-t"
            onClick={() => setShowMenu(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
    </div>
  );
}

function SignoffBadge({ status, rejectionNote }: { status?: string; rejectionNote?: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  switch (status) {
    case "approved":
      return (
        <span className="inline-block h-5 w-5 rounded-full bg-green-500 text-white text-xs leading-5">
          ✓
        </span>
      );
    case "completed_pending_review":
      return (
        <span className="inline-block h-5 w-5 rounded-full bg-yellow-400 text-white text-xs leading-5">
          ⏳
        </span>
      );
    case "rejected":
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span className="inline-block h-5 w-5 rounded-full bg-red-500 text-white text-xs leading-5">
            ✗
          </span>
          {rejectionNote && (
            <span className="text-[10px] text-red-600 max-w-[80px] truncate" title={rejectionNote}>
              {rejectionNote}
            </span>
          )}
        </div>
      );
    case "missed":
      return (
        <span className="inline-block h-5 w-5 rounded-full bg-red-300 text-white text-xs leading-5">
          M
        </span>
      );
    default:
      return <span className="text-muted-foreground">○</span>;
  }
}
