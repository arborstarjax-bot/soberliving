"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldAlert, Loader2 } from "lucide-react";
import {
  issueChoreWarning,
  issueChoreDemerit,
} from "../discipline/warning-actions";

interface MissedSignoff {
  id: string;
  sign_off_date: string;
  day_of_week: string;
  week_number: number;
  rotation_assignment: {
    resident: { full_name: string } | null;
    chore: { name: string; house_id: string } | null;
  } | null;
}

interface Props {
  signoffs: MissedSignoff[];
  canAct?: boolean;
}

export function MissedChoresList({ signoffs, canAct = false }: Props) {
  const [, startTransition] = useTransition();
  // Track pending ids as a Set so concurrent clicks on different rows
  // each keep their own spinner/disabled state instead of stomping a
  // single pendingId. Previous single-string version cleared row A's
  // disabled state the moment row B was clicked.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [done, setDone] = useState<Record<string, "warning" | "demerit">>({});

  if (signoffs.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No missed chores
      </p>
    );
  }

  function handle(
    id: string,
    kind: "warning" | "demerit"
  ) {
    setPendingIds((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
    setErrors((e) => ({ ...e, [id]: null }));
    startTransition(async () => {
      const result =
        kind === "warning"
          ? await issueChoreWarning(id)
          : await issueChoreDemerit(id);
      if ("error" in result && result.error) {
        setErrors((e) => ({ ...e, [id]: result.error as string }));
      } else {
        setDone((d) => ({ ...d, [id]: kind }));
      }
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    });
  }

  return (
    <div className="space-y-2">
      {signoffs.map((s) => {
        const ra = s.rotation_assignment;
        const isPending = pendingIds.has(s.id);
        const issued = done[s.id];
        const err = errors[s.id];
        return (
          <Card key={s.id} className="border-red-200">
            <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{ra?.chore?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ra?.resident?.full_name} ·{" "}
                  {new Date(s.sign_off_date).toLocaleDateString()} ·{" "}
                  <span className="capitalize">{s.day_of_week}</span> (Week{" "}
                  {s.week_number})
                </p>
                {err && (
                  <p className="mt-1 text-xs text-red-600">{err}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {issued ? (
                  <Badge
                    variant={issued === "demerit" ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {issued === "demerit" ? "Demerit issued" : "Warning issued"}
                  </Badge>
                ) : canAct ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handle(s.id, "warning")}
                    >
                      {isPending ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                      )}
                      Warning
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => handle(s.id, "demerit")}
                    >
                      {isPending ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                      )}
                      Demerit
                    </Button>
                  </>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    Missed
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
