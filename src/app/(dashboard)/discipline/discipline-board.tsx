"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Resident {
  id: string;
  full_name: string;
  house_id: string;
  move_in_date: string | null;
  status: string;
}

interface Demerit {
  id: string;
  resident_id: string;
  house_id: string;
  reason: string;
  status: string;
  auto_generated: boolean;
  created_at: string;
  worked_off_at: string | null;
  worked_off_note: string | null;
}

export function DisciplineBoard({
  residents,
  demerits,
  houseName,
}: {
  residents: Resident[];
  demerits: Demerit[];
  houseName: string;
}) {
  // Group demerits by resident
  const demeritsByResident = new Map<string, Demerit[]>();
  for (const d of demerits) {
    const arr = demeritsByResident.get(d.resident_id) ?? [];
    arr.push(d);
    demeritsByResident.set(d.resident_id, arr);
  }

  // Find the max number of demerits any resident has (for grid columns)
  const maxDemerits = Math.max(
    ...residents.map((r) => (demeritsByResident.get(r.id) ?? []).length),
    1
  );

  // Show up to 12 columns or max demerits, whichever is larger
  const columns = Math.max(maxDemerits, 10);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{houseName} — Discipline Board</CardTitle>
        <p className="text-xs text-muted-foreground">
          Each cell represents a demerit. Red = Active, Green = Worked Off.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <TooltipProvider>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium whitespace-nowrap min-w-[150px]">
                  Resident
                </th>
                <th className="text-left py-2 px-2 font-medium text-xs whitespace-nowrap">
                  Arrived
                </th>
                {Array.from({ length: columns }, (_, i) => (
                  <th
                    key={i}
                    className="text-center py-2 px-1 font-medium text-xs w-8"
                  >
                    {i + 1}
                  </th>
                ))}
                <th className="text-center py-2 px-2 font-medium text-xs">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {residents.map((resident) => {
                const resDemerits = demeritsByResident.get(resident.id) ?? [];
                const activeCount = resDemerits.filter(
                  (d) => d.status === "active"
                ).length;
                const workedOffCount = resDemerits.filter(
                  (d) => d.status === "worked_off"
                ).length;

                return (
                  <tr key={resident.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-medium whitespace-nowrap sticky left-0 z-10 bg-background">
                      {resident.full_name}
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                      {resident.move_in_date
                        ? new Date(resident.move_in_date).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric" }
                          )
                        : "—"}
                    </td>
                    {Array.from({ length: columns }, (_, i) => {
                      const demerit = resDemerits[i];
                      if (!demerit) {
                        return (
                          <td key={i} className="py-2 px-1 text-center">
                            <div className="w-6 h-6 mx-auto rounded border border-dashed border-muted-foreground/20" />
                          </td>
                        );
                      }

                      const isWorkedOff = demerit.status === "worked_off";
                      const date = new Date(
                        demerit.created_at
                      ).toLocaleDateString();

                      return (
                        <td key={i} className="py-2 px-1 text-center">
                          <Tooltip>
                            <TooltipTrigger
                              className={`w-6 h-6 mx-auto rounded flex items-center justify-center text-xs font-bold cursor-default ${
                                isWorkedOff
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border border-red-200 dark:border-red-800"
                              }`}
                            >
                              {isWorkedOff ? "W" : "X"}
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-[250px]"
                            >
                              <p className="font-medium">{demerit.reason}</p>
                              <p className="text-xs opacity-70">{date}</p>
                              {isWorkedOff && demerit.worked_off_note && (
                                <p className="text-xs mt-1">
                                  Worked off: {demerit.worked_off_note}
                                </p>
                              )}
                              {demerit.auto_generated && (
                                <Badge
                                  variant="outline"
                                  className="mt-1 text-[10px]"
                                >
                                  Auto-generated
                                </Badge>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {activeCount > 0 && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] h-5 px-1.5"
                          >
                            {activeCount}
                          </Badge>
                        )}
                        {workedOffCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5 px-1.5"
                          >
                            {workedOffCount}W
                          </Badge>
                        )}
                        {activeCount === 0 && workedOffCount === 0 && (
                          <span className="text-muted-foreground text-xs">
                            0
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {residents.length === 0 && (
                <tr>
                  <td
                    colSpan={columns + 3}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No residents in this house
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
