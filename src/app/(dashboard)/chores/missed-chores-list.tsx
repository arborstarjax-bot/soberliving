"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MissedSignoff {
  id: string;
  sign_off_date: string;
  day_of_week: string;
  week_number: number;
  rotation_assignment: {
    resident: { full_name: string } | null;
    chore: { name: string; house_id: string } | null;
  } | null;
}

interface Props {
  signoffs: MissedSignoff[];
}

export function MissedChoresList({ signoffs }: Props) {
  if (signoffs.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No missed chores
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {signoffs.map((s) => {
        const ra = s.rotation_assignment;
        return (
          <Card key={s.id} className="border-red-200">
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{ra?.chore?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ra?.resident?.full_name} ·{" "}
                  {new Date(s.sign_off_date).toLocaleDateString()} ·{" "}
                  <span className="capitalize">{s.day_of_week}</span> (Week{" "}
                  {s.week_number})
                </p>
              </div>
              <Badge variant="destructive" className="text-xs">
                Missed
              </Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
