"use client";

import { useActionState } from "react";
import { createNote } from "../actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { UserRole } from "@/lib/types";

interface Note {
  id: string;
  content: string;
  created_at: string;
  author: { full_name: string } | null;
}

interface Props {
  residentId: string;
  notes: Note[];
  userRole: UserRole;
}

export function ResidentNotes({ residentId, notes, userRole }: Props) {
  const [state, action, pending] = useActionState(createNote, undefined);
  const canAdd = userRole === "admin" || userRole === "manager";

  return (
    <div className="space-y-4">
      {canAdd && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="resident_id" value={residentId} />
          <Textarea
            name="content"
            placeholder="Add a note..."
            rows={3}
            required
          />
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Add Note"}
          </Button>
        </form>
      )}

      {notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-md border p-3">
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {note.author?.full_name ?? "Unknown"} ·{" "}
                {new Date(note.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-center py-4">No notes yet</p>
      )}
    </div>
  );
}
