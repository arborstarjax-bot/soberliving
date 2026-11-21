"use client";

import { useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { updateGrievanceNotes } from "../actions";

export function NotesEditor({
  grievanceId,
  initialValue,
}: {
  grievanceId: string;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== saved;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateGrievanceNotes(grievanceId, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(value);
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Admin-only notes on this report…"
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={save}
          disabled={!dirty || isPending}
        >
          {isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          {dirty ? "Save notes" : "Saved"}
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
