"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateChoreSchedule } from "./actions";

const DAYS = [
  { key: "sunday", label: "Sun" },
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
] as const;

interface Chore {
  id: string;
  name: string;
  scheduled_days: string[];
  house_id: string;
}

export function ChoreScheduleEditor({
  chores,
  houseName,
}: {
  chores: Chore[];
  houseName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function startEdit(chore: Chore) {
    setEditingId(chore.id);
    setSelectedDays(chore.scheduled_days ?? []);
    setError(null);
  }

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function save(choreId: string) {
    startTransition(async () => {
      const result = await updateChoreSchedule(choreId, selectedDays);
      if (result.error) {
        setError(result.error);
      } else {
        setEditingId(null);
        setError(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">
          Day-of-Week Schedule — {houseName}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Set which days each chore is scheduled. Chores not completed on
          scheduled days generate demerits.
        </p>
      </CardHeader>
      <CardContent>
        {chores.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No chores for this house
          </p>
        ) : (
          <div className="space-y-3">
            {chores.map((chore) => {
              const isEditing = editingId === chore.id;
              const days = isEditing ? selectedDays : chore.scheduled_days ?? [];

              return (
                <div
                  key={chore.id}
                  className="flex items-center gap-3 border rounded-md p-3"
                >
                  <div className="min-w-[120px] font-medium text-sm">
                    {chore.name}
                  </div>

                  <div className="flex gap-1 flex-1">
                    {DAYS.map(({ key, label }) => {
                      const active = days.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={!isEditing || isPending}
                          onClick={() => toggleDay(key)}
                          className={`w-9 h-7 rounded text-xs font-medium transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : isEditing
                                ? "bg-muted hover:bg-muted/80 text-muted-foreground"
                                : "bg-muted/50 text-muted-foreground/50"
                          } ${isEditing ? "cursor-pointer" : "cursor-default"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isEditing ? (
                      <>
                        {(chore.scheduled_days ?? []).length > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            {chore.scheduled_days.length}d/wk
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => startEdit(chore)}
                        >
                          Edit
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={isPending}
                          onClick={() => save(chore.id)}
                        >
                          {isPending ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setEditingId(null);
                            setError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
