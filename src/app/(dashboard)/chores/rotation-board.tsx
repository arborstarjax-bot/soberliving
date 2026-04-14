"use client";

import { useActionState } from "react";
import { assignRotationChore } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface RotationAssignment {
  id: string;
  chore_id: string;
  resident_id: string;
  chore: { id: string; name: string } | null;
  resident: { id: string; full_name: string } | null;
  chore_signoffs: Array<{
    id: string;
    day_of_week: string;
    week_number: number;
    status: string;
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
  chores: Array<{ id: string; name: string; house_id: string }>;
  residents: Array<{ id: string; full_name: string }>;
  assignments: RotationAssignment[];
}

export function RotationBoard({
  rotation,
  houseName,
  chores,
  residents,
  assignments,
}: Props) {
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
          <Badge variant="outline">2-Week Cycle</Badge>
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
                <th className="border p-2 text-center bg-muted" colSpan={3}>
                  Week 1
                </th>
                <th className="border p-2 text-center bg-muted" colSpan={3}>
                  Week 2
                </th>
              </tr>
              <tr>
                <th className="border p-2" />
                <th className="border p-2" />
                {["Mon", "Wed", "Fri", "Mon", "Wed", "Fri"].map((d, i) => (
                  <th key={i} className="border p-2 text-center text-xs">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chores.map((chore) => {
                const assignment = assignments.find(
                  (a) => a.chore_id === chore.id
                );
                return (
                  <tr key={chore.id}>
                    <td className="border p-2 font-medium">{chore.name}</td>
                    <td className="border p-2">
                      {assignment ? (
                        <span>{assignment.resident?.full_name}</span>
                      ) : (
                        <AssignResidentInline
                          rotationId={rotation.id}
                          choreId={chore.id}
                          residents={residents}
                        />
                      )}
                    </td>
                    {[1, 2].flatMap((week) =>
                      (["monday", "wednesday", "friday"] as const).map(
                        (day) => {
                          const signoff = assignment?.chore_signoffs?.find(
                            (s) =>
                              s.week_number === week && s.day_of_week === day
                          );
                          return (
                            <td
                              key={`${chore.id}-${week}-${day}`}
                              className="border p-2 text-center"
                            >
                              <SignoffBadge status={signoff?.status} />
                            </td>
                          );
                        }
                      )
                    )}
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

function SignoffBadge({ status }: { status?: string }) {
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
        <span className="inline-block h-5 w-5 rounded-full bg-red-500 text-white text-xs leading-5">
          ✗
        </span>
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
