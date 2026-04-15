"use client";

import { useState, useTransition, useRef } from "react";
import { markSignoffComplete, uploadChorePhoto } from "./actions";
import { compressImage } from "@/lib/compress-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ALL_DAYS, DAY_LABELS } from "@/lib/validations";
import { Camera } from "lucide-react";

interface Props {
  rotations: Array<{
    id: string;
    cycle_start_date: string;
    cycle_end_date: string;
    chore_rotation_assignments: Array<{
      id: string;
      chore: {
        id: string;
        name: string;
        days_of_week?: string[];
        cycle_weeks?: number;
        chore_tasks: Array<{
          id: string;
          description: string;
          sort_order: number;
          is_active: boolean;
        }>;
      };
      chore_signoffs: Array<{
        id: string;
        day_of_week: string;
        week_number: number;
        status: string;
        sign_off_date: string;
      }>;
    }>;
  }>;
  userResidentId?: string | null;
  forcePhoto?: boolean;
}

function getCurrentWeekNumber(cycleStartDate: string): number {
  const start = new Date(cycleStartDate + "T00:00:00");
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(diffDays / 7) + 1;
  return Math.max(1, weekNum);
}

function getTodayDayOfWeek(): string {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[new Date().getDay()];
}

export function ResidentChoreView({ rotations, userResidentId, forcePhoto }: Props) {
  if (rotations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No chores assigned to you this cycle.
          </p>
        </CardContent>
      </Card>
    );
  }

  const todayDay = getTodayDayOfWeek();

  return (
    <div className="space-y-6">
      {rotations.map((rotation) => {
        const currentWeek = getCurrentWeekNumber(rotation.cycle_start_date);

        return rotation.chore_rotation_assignments.map((assignment) => {
          const choreDays: string[] =
            assignment.chore.days_of_week ?? ["monday", "wednesday", "friday"];
          const cycleWeeks = assignment.chore.cycle_weeks ?? 2;
          const displayWeek = Math.min(currentWeek, cycleWeeks);

          return (
            <Card key={assignment.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{assignment.chore.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {new Date(
                        rotation.cycle_start_date
                      ).toLocaleDateString()}{" "}
                      —{" "}
                      {new Date(
                        rotation.cycle_end_date
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline">
                    Week {displayWeek} of {cycleWeeks}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Task checklist */}
                {assignment.chore.chore_tasks
                  ?.filter((t) => t.is_active)
                  .sort((a, b) => a.sort_order - b.sort_order).length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Tasks:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                      {assignment.chore.chore_tasks
                        .filter((t) => t.is_active)
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((task) => (
                          <li key={task.id}>{task.description}</li>
                        ))}
                    </ol>
                  </div>
                )}

                {/* Signoff grid - current week Mon-Sun */}
                <div>
                  <p className="text-sm font-medium mb-2">
                    Sign-off Tracking:
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead>
                        <tr>
                          <th className="border p-2 text-left bg-muted">
                            Day
                          </th>
                          {ALL_DAYS.map((day) => (
                            <th
                              key={day}
                              className={`border p-2 text-center bg-muted text-xs ${day === todayDay ? "bg-primary/10 font-bold" : ""}`}
                            >
                              {DAY_LABELS[day]}
                              {day === todayDay && (
                                <span className="block text-[10px] text-primary">
                                  Today
                                </span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border p-2 font-medium">
                            {assignment.chore.name}
                          </td>
                          {ALL_DAYS.map((day) => {
                            const isScheduled = choreDays.includes(day);
                            if (!isScheduled) {
                              return (
                                <td
                                  key={day}
                                  className="border p-2 text-center bg-muted/30"
                                />
                              );
                            }
                            const signoff = assignment.chore_signoffs.find(
                              (s) =>
                                s.week_number === displayWeek &&
                                s.day_of_week === day
                            );
                            const isToday = day === todayDay;
                            // Residents can only mark today's signoff
                            const canCheckOff =
                              signoff &&
                              signoff.status === "pending" &&
                              isToday;

                            return (
                              <td
                                key={day}
                                className={`border p-2 text-center ${day === todayDay ? "bg-primary/5" : ""}`}
                              >
                                {canCheckOff ? (
                                  <ResidentSignoffButton
                                    signoffId={signoff.id}
                                    forcePhoto={forcePhoto}
                                  />
                                ) : signoff ? (
                                  <SignoffCell signoff={signoff} />
                                ) : (
                                  "—"
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        });
      })}
    </div>
  );
}

function ResidentSignoffButton({ signoffId, forcePhoto }: { signoffId: string; forcePhoto?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSignoff(photoUrl?: string) {
    setError(null);
    startTransition(async () => {
      const result = await markSignoffComplete(signoffId, photoUrl);
      if (result?.error) {
        setError(result.error);
        setShowPhotoUpload(false);
      }
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    setError(null);

    startTransition(async () => {
      const file = await compressImage(raw);
      const formData = new FormData();
      formData.append("file", file);
      const uploadResult = await uploadChorePhoto(formData);
      if (uploadResult.error) {
        setError(uploadResult.error);
        return;
      }
      await handleSignoff(uploadResult.url);
    });
  }

  if (forcePhoto && showPhotoUpload) {
    return (
      <div className="space-y-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          className="h-7 text-xs gap-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="h-3 w-3" />
          {pending ? "Uploading…" : "Take Photo"}
        </Button>
        <button
          type="button"
          className="block text-[10px] text-muted-foreground hover:underline"
          onClick={() => setShowPhotoUpload(false)}
        >
          Cancel
        </button>
        {error && <p className="text-[10px] text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="inline-flex items-center justify-center h-8 w-8 rounded-full border-2 border-dashed border-green-500/50 text-green-600 hover:border-green-500 hover:bg-green-50 transition-colors text-sm font-medium"
        title={forcePhoto ? "Photo required — click to sign off" : "Mark as done"}
        onClick={() => {
          if (forcePhoto) {
            setShowPhotoUpload(true);
          } else {
            handleSignoff();
          }
        }}
      >
        {pending ? "…" : forcePhoto ? "📷" : "✓"}
      </button>
      {error && (
        <p className="text-[10px] text-destructive mt-0.5">{error}</p>
      )}
    </div>
  );
}

function SignoffCell({
  signoff,
}: {
  signoff: { id: string; status: string; sign_off_date: string };
}) {
  const today = new Date().toISOString().split("T")[0];
  const isFuture = signoff.sign_off_date > today;

  if (signoff.status === "approved") {
    return (
      <Badge variant="default" className="text-xs">
        ✓
      </Badge>
    );
  }
  if (signoff.status === "completed_pending_review") {
    return (
      <Badge variant="secondary" className="text-xs">
        Review
      </Badge>
    );
  }
  if (signoff.status === "rejected") {
    return (
      <Badge variant="destructive" className="text-xs">
        Redo
      </Badge>
    );
  }
  if (signoff.status === "missed") {
    return (
      <Badge variant="destructive" className="text-xs">
        Missed
      </Badge>
    );
  }
  if (isFuture) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Badge variant="outline" className="text-xs">
      Pending
    </Badge>
  );
}
