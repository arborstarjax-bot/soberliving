"use client";

import { useState, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Check, Upload } from "lucide-react";
import { completeChore, uploadChorePhoto } from "./actions";

interface ChoreForCompletion {
  id: string;
  name: string;
  house_id: string;
  scheduled_days: string[];
}

export function ChoreCompletionForm({
  chores,
  residentId,
  forcePhoto,
  completedToday,
}: {
  chores: ChoreForCompletion[];
  residentId: string;
  forcePhoto: boolean;
  completedToday: string[]; // chore IDs already completed today
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeChoreId, setActiveChoreId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][new Date().getDay()];

  // Filter chores scheduled for today
  const todaysChores = chores.filter(
    (c) => c.scheduled_days?.includes(dayOfWeek)
  );

  async function handlePhotoUpload(file: File) {
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadChorePhoto(formData);
    setUploading(false);
    if (result.error) {
      setError(result.error);
      return null;
    }
    setPhotoUrl(result.url ?? null);
    return result.url ?? null;
  }

  function handleComplete(choreId: string) {
    if (forcePhoto && !photoUrl) {
      setActiveChoreId(choreId);
      fileRef.current?.click();
      return;
    }

    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const result = await completeChore(choreId, residentId, today, photoUrl ?? undefined);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Chore marked complete!");
        setPhotoUrl(null);
        setActiveChoreId(null);
        setTimeout(() => setSuccess(null), 3000);
      }
    });
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await handlePhotoUpload(file);
    if (url && activeChoreId) {
      startTransition(async () => {
        setError(null);
        setSuccess(null);
        const result = await completeChore(activeChoreId, residentId, today, url);
        if (result.error) {
          setError(result.error);
        } else {
          setSuccess("Chore marked complete with photo!");
          setPhotoUrl(null);
          setActiveChoreId(null);
          setTimeout(() => setSuccess(null), 3000);
        }
      });
    }
    e.target.value = "";
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          Today&apos;s Chores
          {forcePhoto && (
            <Badge variant="destructive" className="text-[10px]">
              <Camera className="mr-1 h-3 w-3" /> Photo Required
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </CardHeader>
      <CardContent>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFileChange}
        />

        {todaysChores.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No chores scheduled for today
          </p>
        ) : (
          <div className="space-y-2">
            {todaysChores.map((chore) => {
              const isCompleted = completedToday.includes(chore.id);

              return (
                <div
                  key={chore.id}
                  className={`flex items-center justify-between border rounded-md p-3 ${
                    isCompleted
                      ? "bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isCompleted && (
                      <Check className="h-4 w-4 text-green-600" />
                    )}
                    <span
                      className={`text-sm font-medium ${
                        isCompleted ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {chore.name}
                    </span>
                  </div>

                  {!isCompleted && (
                    <div className="flex items-center gap-2">
                      {!forcePhoto && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={isPending || uploading}
                          onClick={() => {
                            setActiveChoreId(chore.id);
                            fileRef.current?.click();
                          }}
                        >
                          <Upload className="mr-1 h-3 w-3" /> Photo
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={isPending || uploading}
                        onClick={() => handleComplete(chore.id)}
                      >
                        {isPending ? "Saving…" : forcePhoto ? (
                          <>
                            <Camera className="mr-1 h-3 w-3" /> Complete with Photo
                          </>
                        ) : (
                          "Mark Complete"
                        )}
                      </Button>
                    </div>
                  )}

                  {isCompleted && (
                    <Badge variant="secondary" className="text-[10px]">
                      Done
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        {success && (
          <p className="text-sm text-green-600 mt-2">{success}</p>
        )}

        {photoUrl && (
          <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
            <Camera className="h-3 w-3" /> Photo uploaded — will be attached to
            next completion
          </div>
        )}
      </CardContent>
    </Card>
  );
}
