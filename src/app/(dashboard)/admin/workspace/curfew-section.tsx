"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateHouseCurfews } from "./actions";
import type { HouseCurfew } from "@/lib/types";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

interface House {
  id: string;
  name: string;
}

export function CurfewSection({
  houses,
  curfews,
}: {
  houses: House[];
  curfews: HouseCurfew[];
}) {
  const [selectedHouse, setSelectedHouse] = useState(houses[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  // Build curfew map for the selected house
  const houseCurfews = curfews.filter((c) => c.house_id === selectedHouse);
  const curfewMap: Record<string, string> = {};
  const curfewStartMap: Record<string, string> = {};
  for (const c of houseCurfews) {
    curfewMap[c.day_of_week] = c.curfew_time;
    if (c.curfew_start_time) curfewStartMap[c.day_of_week] = c.curfew_start_time;
  }

  const [times, setTimes] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const day of DAYS) {
      initial[day] = curfewMap[day] ?? "22:00";
    }
    return initial;
  });

  const [startTimes, setStartTimes] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const day of DAYS) {
      initial[day] = curfewStartMap[day] ?? "22:00";
    }
    return initial;
  });

  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const day of DAYS) {
      initial[day] = day in curfewMap;
    }
    return initial;
  });

  function handleHouseChange(houseId: string) {
    setSelectedHouse(houseId);
    const hc = curfews.filter((c) => c.house_id === houseId);
    const map: Record<string, string> = {};
    const startMap: Record<string, string> = {};
    for (const c of hc) {
      map[c.day_of_week] = c.curfew_time;
      if (c.curfew_start_time) startMap[c.day_of_week] = c.curfew_start_time;
    }

    const newTimes: Record<string, string> = {};
    const newStartTimes: Record<string, string> = {};
    const newEnabled: Record<string, boolean> = {};
    for (const day of DAYS) {
      newTimes[day] = map[day] ?? "22:00";
      newStartTimes[day] = startMap[day] ?? "22:00";
      newEnabled[day] = day in map;
    }
    setTimes(newTimes);
    setStartTimes(newStartTimes);
    setEnabled(newEnabled);
    setMessage("");
  }

  function handleSave() {
    const curfewRows = DAYS.filter((d) => enabled[d]).map((d) => ({
      day_of_week: d,
      curfew_time: times[d],
      curfew_start_time: startTimes[d] || null,
    }));

    startTransition(async () => {
      const result = await updateHouseCurfews(selectedHouse, curfewRows);
      if (result.error) {
        setMessage(result.error);
      } else {
        setMessage("Saved");
        setTimeout(() => setMessage(""), 2000);
      }
    });
  }

  if (houses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>House Curfews</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No houses found. Add a house first to configure curfews.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>House Curfews</CardTitle>
        <CardDescription>
          Set curfew window (start → end) for each day per house
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {houses.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="curfew-house">House</Label>
            <select
              id="curfew-house"
              value={selectedHouse}
              onChange={(e) => handleHouseChange(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-3">
          {DAYS.map((day) => (
            <div key={day} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setEnabled((prev) => ({ ...prev, [day]: !prev[day] }))
                }
                className={`w-10 h-6 rounded-full border-2 border-transparent transition-colors relative shrink-0 ${
                  enabled[day]
                    ? "bg-primary"
                    : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-background shadow-sm absolute top-0.5 transition-transform ${
                    enabled[day] ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="w-10 text-sm font-medium">
                {DAY_LABELS[day]}
              </span>
              <div className="flex items-center gap-1">
                <Input
                  type="time"
                  value={startTimes[day]}
                  onChange={(e) =>
                    setStartTimes((prev) => ({ ...prev, [day]: e.target.value }))
                  }
                  disabled={!enabled[day]}
                  className="w-28"
                  title="Curfew starts"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={times[day]}
                  onChange={(e) =>
                    setTimes((prev) => ({ ...prev, [day]: e.target.value }))
                  }
                  disabled={!enabled[day]}
                  className="w-28"
                  title="Curfew ends"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={pending || !selectedHouse}>
            {pending ? "Saving..." : "Save Curfews"}
          </Button>
          {message && (
            <p
              className={`text-sm ${message === "Saved" ? "text-green-600" : "text-destructive"}`}
            >
              {message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
