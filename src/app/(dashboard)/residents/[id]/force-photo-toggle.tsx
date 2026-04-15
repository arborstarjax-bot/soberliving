"use client";

import { useState, useTransition } from "react";
import { updateResidentForcePhoto } from "../actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Camera } from "lucide-react";

interface ForcePhotoToggleProps {
  residentId: string;
  initialValue: boolean;
}

export function ForcePhotoToggle({
  residentId,
  initialValue,
}: ForcePhotoToggleProps) {
  const [enabled, setEnabled] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <Camera className="h-4 w-4 text-muted-foreground" />
      <Label
        htmlFor="force-photo"
        className="text-sm font-medium cursor-pointer"
      >
        Require photo for chore sign-off
      </Label>
      <Switch
        id="force-photo"
        checked={enabled}
        disabled={pending}
        onCheckedChange={(checked) => {
          setError(null);
          setEnabled(checked);
          startTransition(async () => {
            const result = await updateResidentForcePhoto(residentId, checked);
            if (result?.error) {
              setError(result.error);
              setEnabled(!checked); // revert
            }
          });
        }}
      />
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
