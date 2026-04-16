"use client";

import { useState, useTransition } from "react";
import { assignManagerToHouses } from "../actions";
import { Button } from "@/components/ui/button";

interface Props {
  userId: string;
  houses: { id: string; name: string }[];
  assignedHouseIds: string[];
}

export function HouseAssignmentsForm({
  userId,
  houses,
  assignedHouseIds,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedHouseIds));

  function toggleHouse(houseId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(houseId)) {
        next.delete(houseId);
      } else {
        next.add(houseId);
      }
      return next;
    });
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        setSuccess(false);
        formData.append("user_id", userId);
        for (const houseId of selected) {
          formData.append("house_ids", houseId);
        }
        startTransition(async () => {
          const result = await assignManagerToHouses(undefined, formData);
          if (result?.error) {
            setError(result.error);
          } else {
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
          }
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        {houses.map((house) => (
          <label key={house.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(house.id)}
              onChange={() => toggleHouse(house.id)}
              className="h-4 w-4 rounded border-input"
            />
            {house.name}
          </label>
        ))}
        {houses.length === 0 && (
          <p className="text-sm text-muted-foreground">No active houses found.</p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">House assignments saved</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save House Assignments"}
      </Button>
    </form>
  );
}
