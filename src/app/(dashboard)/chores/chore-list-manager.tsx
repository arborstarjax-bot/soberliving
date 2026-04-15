"use client";

import { useActionState, useState, useTransition } from "react";
import { addChoreTask, removeChoreTask, archiveChore } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Trash2 } from "lucide-react";

interface ChoreTask {
  id: string;
  description: string;
  sort_order: number;
}

interface ChoreWithTasks {
  id: string;
  house_id: string;
  name: string;
  sort_order: number;
  tasks: ChoreTask[];
}

interface Exclusion {
  id: string;
  chore_id: string;
  resident_id: string;
  reason: string | null;
  resident: { full_name: string } | null;
}

interface Props {
  houses: { id: string; name: string }[];
  chores: ChoreWithTasks[];
  residents: { id: string; full_name: string; house_id: string }[];
  exclusions: Exclusion[];
}

export function ChoreListManager({ houses, chores, residents, exclusions }: Props) {
  const [selectedHouse, setSelectedHouse] = useState(houses[0]?.id ?? "");

  const houseChores = chores.filter((c) => c.house_id === selectedHouse);

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
            <ChoreCard key={chore.id} chore={chore} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChoreCard({ chore }: { chore: ChoreWithTasks }) {
  const [addState, addAction, addPending] = useActionState(
    addChoreTask,
    undefined
  );
  const [isArchiving, startArchive] = useTransition();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{chore.name}</CardTitle>
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
      </CardContent>
    </Card>
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
