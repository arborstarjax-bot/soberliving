"use client";

import { useActionState, useState, useTransition } from "react";
import { addChoreTask, removeChoreTask, archiveChore, addChoreExclusion, removeChoreExclusion } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Trash2, UserMinus } from "lucide-react";

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
  sort_order: number;
  tasks: ChoreTask[];
}

interface Props {
  houses: { id: string; name: string }[];
  chores: ChoreWithTasks[];
  residents: { id: string; full_name: string; house_id: string }[];
  exclusions: ChoreExclusion[];
}

export function ChoreListManager({ houses, chores, residents, exclusions }: Props) {
  const [selectedHouse, setSelectedHouse] = useState(houses[0]?.id ?? "");

  const houseChores = chores.filter((c) => c.house_id === selectedHouse);
  const houseResidents = residents.filter((r) => r.house_id === selectedHouse);

  return (
    <div className="space-y-4">
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
}: {
  chore: ChoreWithTasks;
  residents: { id: string; full_name: string }[];
  exclusions: ChoreExclusion[];
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{chore.name}</CardTitle>
            {exclusions.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {exclusions.length} excluded
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setShowExclusions(!showExclusions)}
              title="Manage exclusions"
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
                  confirm(`Archive "${chore.name}"? It will no longer appear in rotations.`)
                ) {
                  startArchive(() => { archiveChore(chore.id); });
                }
              }}
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
          <span className="text-muted-foreground ml-1">— {exclusion.reason}</span>
        )}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive p-1"
        disabled={isPending}
        onClick={() => startTransition(() => { removeChoreExclusion(exclusion.id); })}
        title="Remove exclusion"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function TaskRow({ task, index }: { task: ChoreTask; index: number }) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground w-5 text-right">{index}.</span>
      <span className="flex-1">{task.description}</span>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive p-1"
        disabled={isPending}
        onClick={() => startTransition(() => { removeChoreTask(task.id); })}
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  );
}
