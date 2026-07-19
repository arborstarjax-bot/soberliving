"use client";

import { useActionState, useState } from "react";
import { updateRestriction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

const RESTRICTION_TYPES = [
  { value: "no_leave", label: "No Leave" },
  { value: "no_overnight", label: "No Overnight" },
  { value: "weekend_restriction", label: "Weekend Restriction" },
  { value: "house_commitment", label: "House Commitment (New Intake)" },
  { value: "curfew", label: "Curfew" },
  { value: "custom", label: "Custom" },
];

interface Restriction {
  id: string;
  restriction_type: string;
  description: string;
  notes: string | null;
  start_date: string;
  end_date: string | null;
}

interface Props {
  restriction: Restriction;
}

/**
 * Edit an existing restriction in place. Opens from the pencil icon on
 * the restriction row; pre-fills every field from the current row so
 * a staffer can correct a typo, push out the end date, or change the
 * type without having to lift + re-create.
 */
export function EditRestrictionDialog({ restriction }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [state, action, pending] = useActionState(
    async (prev: { error?: string } | undefined, formData: FormData) => {
      const result = await updateRestriction(prev, formData);
      if (!result?.error) {
        setError(undefined);
        setOpen(false);
      } else {
        setError(result.error);
      }
      return result;
    },
    undefined
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" aria-label="Edit restriction" />
        }
      >
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Restriction</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="restriction_id" value={restriction.id} />
          <div className="space-y-2">
            <Label>Restriction Type *</Label>
            <select
              name="restriction_type"
              required
              defaultValue={restriction.restriction_type}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              {RESTRICTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              name="description"
              required
              rows={2}
              defaultValue={restriction.description}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input
                name="start_date"
                type="date"
                required
                defaultValue={restriction.start_date}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                name="end_date"
                type="date"
                defaultValue={restriction.end_date ?? ""}
              />
              <p className="text-[10px] text-muted-foreground">
                Leave blank for indefinite. Auto-expires on end date.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              name="notes"
              rows={2}
              defaultValue={restriction.notes ?? ""}
            />
          </div>
          {(error ?? state?.error) && (
            <p className="text-sm text-red-500">{error ?? state?.error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
