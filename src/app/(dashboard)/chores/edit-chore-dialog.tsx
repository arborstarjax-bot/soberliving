"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { updateChore, setChoreRoomExclusions } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { ALL_DAYS, DAY_LABELS, type DayOfWeek } from "@/lib/validations";

interface Room {
  id: string;
  name: string;
}

interface Props {
  chore: {
    id: string;
    name: string;
    days_of_week: string[];
    cycle_weeks: number;
  };
  rooms: Room[];
  excludedRoomIds: string[];
}

export function EditChoreDialog({ chore, rooms, excludedRoomIds }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateChore, undefined);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(
    (chore.days_of_week as DayOfWeek[]) ?? []
  );
  const [cycleWeeks, setCycleWeeks] = useState<number>(chore.cycle_weeks ?? 2);
  const [excludedRooms, setExcludedRooms] =
    useState<string[]>(excludedRoomIds);
  const [roomSaveError, setRoomSaveError] = useState<string | null>(null);
  const [savingRooms, startSavingRooms] = useTransition();

  // Re-sync local state when dialog opens so repeated Edits pick up latest
  // server values (e.g. after a previous save).
  useEffect(() => {
    if (open) {
      setSelectedDays((chore.days_of_week as DayOfWeek[]) ?? []);
      setCycleWeeks(chore.cycle_weeks ?? 2);
      setExcludedRooms(excludedRoomIds);
      setRoomSaveError(null);
    }
  }, [open, chore.days_of_week, chore.cycle_weeks, excludedRoomIds]);

  // Close the dialog once the server action reports success (no error).
  useEffect(() => {
    if (state && !state.error && pending === false) {
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function toggleDay(day: DayOfWeek) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function toggleRoom(roomId: string) {
    setExcludedRooms((prev) =>
      prev.includes(roomId)
        ? prev.filter((r) => r !== roomId)
        : [...prev, roomId]
    );
  }

  async function handleSubmit(formData: FormData) {
    // Persist room exclusions separately (not in updateChoreSchema) so the
    // chore-level fields and the exclusion set can each succeed/fail on
    // their own. Save rooms first — if that fails we don't touch the chore.
    setRoomSaveError(null);
    const result = await new Promise<{ error?: string } | undefined>(
      (resolve) => {
        startSavingRooms(async () => {
          const r = await setChoreRoomExclusions(chore.id, excludedRooms);
          resolve(r);
        });
      }
    );
    if (result?.error) {
      setRoomSaveError(result.error);
      return;
    }
    // useActionState expects us to call the bound action; it will
    // update `state` which our effect watches to close the dialog.
    action(formData);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            title="Edit chore"
          />
        }
      >
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Chore</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="chore_id" value={chore.id} />
          <div className="space-y-2">
            <Label htmlFor={`chore-name-${chore.id}`}>Chore Name *</Label>
            <Input
              id={`chore-name-${chore.id}`}
              name="name"
              required
              defaultValue={chore.name}
              placeholder="e.g., Kitchen, Master Bathroom"
            />
          </div>

          <div className="space-y-2">
            <Label>Days of Week *</Label>
            <div className="flex flex-wrap gap-3">
              {ALL_DAYS.map((day) => (
                <label
                  key={day}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="days_of_week"
                    value={day}
                    checked={selectedDays.includes(day)}
                    onChange={() => toggleDay(day)}
                    className="h-4 w-4 rounded border-input"
                  />
                  {DAY_LABELS[day]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cycle Length *</Label>
            <div className="flex flex-wrap gap-4">
              {[1, 2, 3, 4].map((weeks) => (
                <label
                  key={weeks}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <input
                    type="radio"
                    name="cycle_weeks"
                    value={weeks}
                    checked={cycleWeeks === weeks}
                    onChange={() => setCycleWeeks(weeks)}
                    className="h-4 w-4"
                  />
                  {weeks} Week{weeks > 1 ? "s" : ""}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Excluded Rooms</Label>
            <p className="text-xs text-muted-foreground">
              Check a room to exclude its residents from this chore&apos;s
              auto-rotation and manual assignment.
            </p>
            {rooms.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No rooms configured for this house.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 rounded-md border p-2">
                {rooms.map((room) => (
                  <label
                    key={room.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={excludedRooms.includes(room.id)}
                      onChange={() => toggleRoom(room.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    {room.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {(state?.error || roomSaveError) && (
            <p className="text-sm text-destructive">
              {roomSaveError ?? state?.error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={pending || savingRooms}
          >
            {pending || savingRooms ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
