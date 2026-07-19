"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { editWarning, deleteWarning } from "./warning-actions";

interface Warning {
  id: string;
  resident_id: string;
  house_id: string;
  reason: string;
  category: string | null;
  notes: string | null;
  photo_url: string | null;
  signoff_id: string | null;
  created_at: string;
  resident_name: string;
  house_name: string;
  issuer_name: string;
}

interface Props {
  warnings: Warning[];
  canEdit?: boolean;
}

export function WarningsList({ warnings, canEdit = false }: Props) {
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onEditOpen(w: Warning) {
    setEditingId(w.id);
    setEditReason(w.reason);
    setEditNotes(w.notes ?? "");
    setError(null);
  }

  function onEditSave() {
    if (!editingId) return;
    startTransition(async () => {
      const r = await editWarning(editingId, editReason, editNotes);
      if (r.error) setError(r.error);
      else setEditingId(null);
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this warning? This cannot be undone.")) return;
    startTransition(async () => {
      const r = await deleteWarning(id);
      if (r.error) setError(r.error);
    });
  }

  if (warnings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-muted-foreground">No warnings on record.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {warnings.map((w) => (
          <Card key={w.id} className="border-amber-200">
            <CardContent className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{w.resident_name}</span>
                    {w.house_name && (
                      <Badge variant="outline" className="text-xs">
                        {w.house_name}
                      </Badge>
                    )}
                    {w.category && (
                      <Badge variant="secondary" className="text-xs">
                        {w.category}
                      </Badge>
                    )}
                    {w.signoff_id && (
                      <Badge variant="outline" className="text-xs">
                        From missed chore
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm">{w.reason}</p>
                  {w.notes && (
                    <p className="text-xs text-muted-foreground italic">
                      Note: {w.notes}
                    </p>
                  )}
                  {w.photo_url && (
                    <a
                      href={w.photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block"
                    >
                      <img
                        src={w.photo_url}
                        alt="Warning evidence"
                        className="mt-1 h-16 w-16 rounded border object-cover"
                      />
                    </a>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Issued by {w.issuer_name} on{" "}
                    {new Date(w.created_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => onEditOpen(w)}
                      disabled={pending}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-600 hover:text-red-700"
                      onClick={() => onDelete(w.id)}
                      disabled={pending}
                    >
                      {pending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={editingId !== null}
        onOpenChange={(o) => !o && setEditingId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Warning</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                rows={2}
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
              <Button onClick={onEditSave} disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
