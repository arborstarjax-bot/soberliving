"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createChore } from "./actions";
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
import { Plus } from "lucide-react";
import { ALL_DAYS, DAY_LABELS, type DayOfWeek } from "@/lib/validations";

interface Room {
  id: string;
  house_id: string;
  name: string;
}

interface Props {
  houses: { id: string; name: string }[];
  rooms: Room[];
  /**
   * House id currently active in the page's house-filter tabs.
   * When the dialog opens we default `house_id` to this so staff
   * can create a chore without re-selecting the house they just
   * switched to — which was the main "chores don't save" report.
   */
  defaultHouseId: string | null;
}

const DEFAULT_DAYS: DayOfWeek[] = ["monday", "wednesday", "friday"];

export function CreateChoreDialog({ houses, rooms, defaultHouseId }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createChore, undefined);
  const initialHouseId =
    defaultHouseId && houses.some((h) => h.id === defaultHouseId)
      ? defaultHouseId
      : houses[0]?.id ?? "";
  const [selectedHouseId, setSelectedHouseId] = useState(initialHouseId);
  const [selectedDays, setSelectedDays] =
    useState<DayOfWeek[]>(DEFAULT_DAYS);
  const [cycleWeeks, setCycleWeeks] = useState(2);
  const [excludedRooms, setExcludedRooms] = useState<string[]>([]);

  // Reset form fields each time the dialog re-opens so stale values
  // from a previous create don't leak in, and so the currently-
  // selected house tab wins over whatever was picked last.
  useEffect(() => {
    if (open) {
      setSelectedHouseId(initialHouseId);
      setSelectedDays(DEFAULT_DAYS);
      setCycleWeeks(2);
      setExcludedRooms([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close the dialog on a successful save. Without this, staff hit
  // "Create", the row saves, but the dialog stays open with the form
  // still filled in — easy to mistake for "nothing happened".
  useEffect(() => {
    if (state && !state.error && !pending && open) {
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pending]);

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

  // Room picker is scoped to the house currently selected in the
  // form — every room chore_room_exclusions row must live in the
  // chore's house, and we want to match the edit dialog's UX.
  const houseRooms = useMemo(
    () => rooms.filter((r) => r.house_id === selectedHouseId),
    [rooms, selectedHouseId]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
          <Plus className="mr-2 h-4 w-4" />
          New Chore
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Chore</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chore-house">House *</Label>
            <select
              name="house_id"
              id="chore-house"
              required
              value={selectedHouseId}
              onChange={(e) => {
                setSelectedHouseId(e.target.value);
                // Drop any previously-checked rooms that belonged to
                // the old house so we don't accidentally POST rooms
                // from the wrong house (server would reject anyway).
                setExcludedRooms([]);
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select house</option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="chore-name">Chore Name *</Label>
            <Input
              id="chore-name"
              name="name"
              required
              placeholder="e.g., Kitchen, Master Bathroom"
            />
          </div>

          {/* Days of Week checkboxes */}
          <div className="space-y-2">
            <Label>Days of Week *</Label>
            <div className="flex flex-wrap gap-3">
              {ALL_DAYS.map((day) => (
                <label key={day} className="flex items-center gap-1.5 text-sm">
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

          {/* Cycle length radio buttons */}
          <div className="space-y-2">
            <Label>Cycle Length *</Label>
            <div className="flex flex-wrap gap-4">
              {[1, 2, 3, 4].map((weeks) => (
                <label key={weeks} className="flex items-center gap-1.5 text-sm">
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

          {/* Optional room exclusions — chore won't rotate onto
              residents bedded in any checked room. */}
          <div className="space-y-2">
            <Label>Excluded Rooms</Label>
            <p className="text-xs text-muted-foreground">
              Check a room to skip its residents from this chore&apos;s
              rotation and manual assignment. Leave blank to include
              every room.
            </p>
            {!selectedHouseId ? (
              <p className="text-xs text-muted-foreground italic">
                Select a house to see rooms.
              </p>
            ) : houseRooms.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No rooms configured for this house.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 rounded-md border p-2">
                {houseRooms.map((room) => (
                  <label
                    key={room.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="excluded_room_ids"
                      value={room.id}
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

          <p className="text-xs text-muted-foreground">
            After creating, add specific tasks from the Chore Lists tab.
          </p>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create Chore"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
