"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setSobrietyDate } from "./actions";

interface SobrietyDateSetterProps {
  currentDate: string | null;
}

export function SobrietyDateSetter({ currentDate }: SobrietyDateSetterProps) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Already set — read-only
  if (currentDate) {
    return null;
  }

  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Set Sobriety Date
      </Button>
    );
  }

  function handleSubmit() {
    if (!date) {
      setError("Please select a date");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setSobrietyDate(date);
      if (result.error) {
        setError(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={new Date().toISOString().split("T")[0]}
          className="w-40"
        />
        <Button size="sm" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { setEditing(false); setError(null); }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        This can only be set once and cannot be changed later.
      </p>
    </div>
  );
}
