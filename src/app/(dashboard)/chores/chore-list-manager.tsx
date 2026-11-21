"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addChoreTask,
  removeChoreTask,
  updateChoreTask,
  archiveChore,
  addChoreExclusion,
  removeChoreExclusion,
} from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Trash2, UserMinus, Check, Pencil } from "lucide-react";
import { EditChoreDialog } from "./edit-chore-dialog";
import { DAY_LABELS, type DayOfWeek } from "@/lib/validations";

interface ChoreTask {
  id: string;
  description: string;
  sort_order: number;
}

interface ChoreExclusion {
  id: string;
  chore_id: string;
  resident_id: string;
  reason: string | null;
  resident: { full_name: string } | null;
}

interface ChoreWithTasks {
  id: string;
  house_id: string;
  name: string;
  days_of_week: string[];
  cycle_weeks: number;
  sort_order: number;
  tasks: ChoreTask[];
}

interface Room {
  id: string;
  house_id: string;
  name: string;
}

interface ChoreRoomExclusion {
  id: string;
  chore_id: string;
  room_id: string;
}

interface Props {
  houses: { id: string; name: string }[];
  chores: ChoreWithTasks[];
  residents: { id: string; full_name: string; house_id: string }[];
  exclusions: ChoreExclusion[];
  rooms: Room[];
  roomExclusions: ChoreRoomExclusion[];
}

export function ChoreListManager({
  houses,
  chores,
  residents,
  exclusions,
  rooms,
  roomExclusions,
}: Props) {
  const [selectedHouse, setSelectedHouse] = useState(houses[0]?.id ?? "");

  // Keep the internal house selector in sync with the `houses` prop.
  // The parent page narrows `houses` based on the URL's `?house=<id>`
  // filter tabs — if we leaned on useEffect here the stale house id
  // would survive one paint, flashing "No chores defined" before the
  // effect corrected it. Adjusting the state during render (React's
  // recommended pattern for derived state) lets React re-render
  // synchronously with the correct value before committing to the DOM.
  if (houses.length > 0 && !houses.some((h) => h.id === selectedHouse)) {
    setSelectedHouse(houses[0].id);
  }

  const houseChores = chores.filter((c) => c.house_id === selectedHouse);
  const houseResidents = residents.filter((r) => r.house_id === selectedHouse);
  const houseRooms = rooms.filter((r) => r.house_id === selectedHouse);

  // When the page-level filter has already narrowed us to a single
  // house, hide this redundant dropdown — the source of truth is
  // the tab strip above. Keeps the two pickers from going out of
  // sync on house switches.
  const showHousePicker = houses.length > 1;

  return (
    <div className="space-y-4">
      {showHousePicker && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">House:</label>
          <select
            value={selectedHouse}
            onChange={(e) => setSelectedHouse(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {houseChores.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">
          No chores defined for this house. Create one using the &ldquo;New Chore&rdquo;
          button above.
        </p>
      ) : (
        <div className="space-y-4">
          {houseChores.map((chore) => (
            <ChoreCard
              key={chore.id}
              chore={chore}
              residents={houseResidents}
              exclusions={exclusions.filter((e) => e.chore_id === chore.id)}
              rooms={houseRooms}
              excludedRoomIds={roomExclusions
                .filter((re) => re.chore_id === chore.id)
                .map((re) => re.room_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChoreCard({
  chore,
  residents,
  exclusions,
  rooms,
  excludedRoomIds,
}: {
  chore: ChoreWithTasks;
  residents: { id: string; full_name: string }[];
  exclusions: ChoreExclusion[];
  rooms: Room[];
  excludedRoomIds: string[];
}) {
  const [addState, addAction, addPending] = useActionState(
    addChoreTask,
    undefined
  );
  const [exclusionState, exclusionAction, exclusionPending] = useActionState(
    addChoreExclusion,
    undefined
  );
  const [isArchiving, startArchive] = useTransition();
  const [showExclusions, setShowExclusions] = useState(false);

  const eligibleResidents = residents.filter(
    (r) => !exclusions.some((e) => e.resident_id === r.id)
  );

  // Short human-readable schedule summary shown under the chore name.
  const dayLabels = (chore.days_of_week ?? [])
    .map((d) => DAY_LABELS[d as DayOfWeek] ?? d)
    .join(", ");
  const scheduleSummary = `${dayLabels || "No days"} · ${chore.cycle_weeks}-week cycle`;

  const excludedRoomNames = rooms
    .filter((r) => excludedRoomIds.includes(r.id))
    .map((r) => r.name);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{chore.name}</CardTitle>
              {exclusions.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {exclusions.length} resident
                  {exclusions.length === 1 ? "" : "s"} excluded
                </Badge>
              )}
              {excludedRoomNames.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {excludedRoomNames.length} room
                  {excludedRoomNames.length === 1 ? "" : "s"} excluded
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{scheduleSummary}</p>
          </div>
          <div className="flex items-center gap-1">
            <EditChoreDialog
              chore={{
                id: chore.id,
                name: chore.name,
                days_of_week: chore.days_of_week ?? [],
                cycle_weeks: chore.cycle_weeks ?? 2,
              }}
              rooms={rooms}
              excludedRoomIds={excludedRoomIds}
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setShowExclusions(!showExclusions)}
              title="Manage resident exclusions"
            >
              <UserMinus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={isArchiving}
              onClick={() => {
                if (
                  confirm(
                    `Archive "${chore.name}"? It will no longer appear in rotations.`
                  )
                ) {
                  startArchive(() => {
                    archiveChore(chore.id);
                  });
                }
              }}
              title="Archive chore"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {chore.tasks.length > 0 && (
          <ol className="space-y-1">
            {chore.tasks.map((task, i) => (
              <TaskRow key={task.id} task={task} index={i + 1} />
            ))}
          </ol>
        )}

        <form action={addAction} className="flex items-center gap-2">
          <input type="hidden" name="chore_id" value={chore.id} />
          <Input
            name="description"
            placeholder="Add task…"
            required
            className="h-8 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={addPending}
            className="h-8"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </form>
        {addState?.error && (
          <p className="text-xs text-destructive">{addState.error}</p>
        )}

        {/* Exclusions section */}
        {showExclusions && (
          <div className="border-t pt-3 mt-3 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              Excluded Residents
            </p>

            {exclusions.length > 0 ? (
              <div className="space-y-1">
                {exclusions.map((ex) => (
                  <ExclusionRow key={ex.id} exclusion={ex} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No exclusions set.</p>
            )}

            {eligibleResidents.length > 0 && (
              <form action={exclusionAction} className="flex items-center gap-2">
                <input type="hidden" name="chore_id" value={chore.id} />
                <select
                  name="resident_id"
                  required
                  className="h-8 rounded border border-input bg-transparent px-2 text-xs flex-1"
                >
                  <option value="">Exclude resident…</option>
                  {eligibleResidents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name}
                    </option>
                  ))}
                </select>
                <Input
                  name="reason"
                  placeholder="Reason (optional)"
                  className="h-8 text-xs flex-1"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={exclusionPending}
                  className="h-8 text-xs"
                >
                  Exclude
                </Button>
              </form>
            )}
            {exclusionState?.error && (
              <p className="text-xs text-destructive">{exclusionState.error}</p>
            )}

            {excludedRoomNames.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Excluded Rooms
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {excludedRoomNames.join(", ")} — edit in the chore&apos;s{" "}
                  <span className="italic">Edit</span> dialog.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExclusionRow({ exclusion }: { exclusion: ChoreExclusion }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex-1">
        {exclusion.resident?.full_name ?? "Unknown"}
        {exclusion.reason && (
          <span className="text-muted-foreground ml-1">
            — {exclusion.reason}
          </span>
        )}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive p-1"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            removeChoreExclusion(exclusion.id);
          })
        }
        title="Remove exclusion"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function TaskRow({ task, index }: { task: ChoreTask; index: number }) {
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(task.description);
  const [saveError, setSaveError] = useState<string | null>(null);

  function save() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setSaveError("Task description can't be empty");
      return;
    }
    if (trimmed === task.description) {
      setIsEditing(false);
      setSaveError(null);
      return;
    }
    setSaveError(null);
    startTransition(async () => {
      const res = await updateChoreTask(task.id, trimmed);
      if (res?.error) {
        setSaveError(res.error);
      } else {
        setIsEditing(false);
      }
    });
  }

  function cancel() {
    setDraft(task.description);
    setIsEditing(false);
    setSaveError(null);
  }

  if (isEditing) {
    return (
      <li className="flex items-start gap-2 text-sm">
        <span className="text-muted-foreground w-5 text-right pt-1.5">
          {index}.
        </span>
        <div className="flex-1 space-y-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
          />
          {saveError && (
            <p className="text-xs text-destructive">{saveError}</p>
          )}
        </div>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground p-1"
          disabled={isPending}
          onClick={save}
          title="Save"
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive p-1"
          disabled={isPending}
          onClick={cancel}
          title="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 text-sm group">
      <span className="text-muted-foreground w-5 text-right">{index}.</span>
      <span className="flex-1">{task.description}</span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        disabled={isPending}
        onClick={() => setIsEditing(true)}
        title="Edit task"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive p-1"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            removeChoreTask(task.id);
          })
        }
        title="Delete task"
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  );
}
