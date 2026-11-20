"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logMeeting } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignaturePad } from "@/components/signature-pad";

interface Props {
  photoRequired: boolean;
}

export function LogMeetingForm({ photoRequired }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [state, action, pending] = useActionState(logMeeting, undefined);

  if (!pending && state && !state.error) {
    queueMicrotask(() => {
      formRef.current?.reset();
      setSignature(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Log a Meeting</CardTitle>
        <p className="text-xs text-muted-foreground">
          Have the facilitator sign on this device after the meeting.
        </p>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meeting_name">Meeting Name *</Label>
              <Input
                id="meeting_name"
                name="meeting_name"
                required
                placeholder="Serenity AA, NA Downtown…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                name="location"
                required
                placeholder="Church hall, 123 Main St"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meeting_at">Date &amp; Time *</Label>
              <Input
                id="meeting_at"
                name="meeting_at"
                type="datetime-local"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facilitator_name">Facilitator Name</Label>
              <Input
                id="facilitator_name"
                name="facilitator_name"
                placeholder="Optional"
              />
            </div>
          </div>

          <input
            type="hidden"
            name="facilitator_signature"
            value={signature ?? ""}
          />
          <SignaturePad
            label="Facilitator Signature *"
            onSignatureChange={setSignature}
          />

          <div className="space-y-2">
            <Label htmlFor="photo">
              Photo{" "}
              {photoRequired ? (
                "*"
              ) : (
                <span className="text-muted-foreground">(optional)</span>
              )}
            </Label>
            <Input
              id="photo"
              name="photo"
              type="file"
              accept="image/*"
              required={photoRequired}
            />
            {photoRequired && (
              <p className="text-xs text-muted-foreground">
                Required — upload a photo of the meeting or sign-in sheet.
              </p>
            )}
          </div>

          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={pending || !signature}
          >
            {pending ? "Saving…" : "Log Meeting"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
