"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateWorkspaceSettings } from "./actions";
import type { WorkspaceSettings } from "@/lib/types";

function Toggle({
  checked,
  onCheckedChange,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function OnboardingSection({
  workspaceId,
  settings,
}: {
  workspaceId: string;
  settings: WorkspaceSettings | null;
}) {
  const [requireApp, setRequireApp] = useState(
    settings?.require_application ?? true
  );
  const [requireCommitment, setRequireCommitment] = useState(
    settings?.require_commitment ?? true
  );
  const [enablePayments, setEnablePayments] = useState(
    settings?.enable_payments ?? true
  );
  const [autoCycleChores, setAutoCycleChores] = useState(
    settings?.auto_cycle_chores ?? false
  );
  const [autoDemerit, setAutoDemerit] = useState(
    settings?.auto_demerit_missed_chores ?? false
  );
  const [requireChorePhoto, setRequireChorePhoto] = useState(
    settings?.require_chore_photo ?? false
  );
  const [requireMeetingPhoto, setRequireMeetingPhoto] = useState(
    settings?.require_meeting_photo ?? false
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function handleSave() {
    startTransition(async () => {
      const result = await updateWorkspaceSettings(workspaceId, {
        require_application: requireApp,
        require_commitment: requireCommitment,
        enable_payments: enablePayments,
        auto_cycle_chores: autoCycleChores,
        auto_demerit_missed_chores: autoDemerit,
        require_chore_photo: requireChorePhoto,
        require_meeting_photo: requireMeetingPhoto,
      });
      if (result.error) {
        setMessage(result.error);
      } else {
        setMessage("Saved");
        setTimeout(() => setMessage(""), 2000);
      }
    });
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Resident Onboarding</CardTitle>
        <CardDescription>
          Configure what&apos;s required when new residents sign up
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="require-app">Require Application (Intake Packet)</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, new residents must complete the full intake application.
              When disabled, only basic info is collected (name, phone, email,
              sobriety date, emergency contact, move-in date).
            </p>
          </div>
          <Toggle
            id="require-app"
            checked={requireApp}
            onCheckedChange={setRequireApp}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="require-commitment">
              Require Commitment Agreement
            </Label>
            <p className="text-sm text-muted-foreground">
              When enabled, new residents must sign a commitment agreement before
              accessing the app. When disabled, residents can use the app
              immediately after completing onboarding.
            </p>
          </div>
          <Toggle
            id="require-commitment"
            checked={requireCommitment}
            onCheckedChange={setRequireCommitment}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="enable-payments">
              Enable Payments
            </Label>
            <p className="text-sm text-muted-foreground">
              When enabled, the Payments section is visible to staff and
              residents. When disabled, all payment-related features are hidden.
            </p>
          </div>
          <Toggle
            id="enable-payments"
            checked={enablePayments}
            onCheckedChange={setEnablePayments}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save Changes"}
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

    <Card>
      <CardHeader>
        <CardTitle>Chores &amp; Meetings</CardTitle>
        <CardDescription>
          Automation and photo requirements for this workspace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="auto-cycle">Auto-Cycle Chores</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, a new chore rotation starts automatically when the
              current cycle ends — chores are re-dealt fairly across all active
              residents. When disabled, staff start each rotation manually.
            </p>
          </div>
          <Toggle
            id="auto-cycle"
            checked={autoCycleChores}
            onCheckedChange={setAutoCycleChores}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="auto-demerit">Auto-Demerit on Missed Chore</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, a chore not marked completed by the next day gets a
              1-point demerit automatically. When disabled, missed chores are
              flagged for staff to issue a warning or demerit by hand.
            </p>
          </div>
          <Toggle
            id="auto-demerit"
            checked={autoDemerit}
            onCheckedChange={setAutoDemerit}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="require-chore-photo">Require Photo for Chores</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, residents must upload a photo to sign off a chore.
              When disabled, photos are optional unless set per resident.
            </p>
          </div>
          <Toggle
            id="require-chore-photo"
            checked={requireChorePhoto}
            onCheckedChange={setRequireChorePhoto}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="require-meeting-photo">Require Photo for Meetings</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, residents must upload a photo (e.g. of a signed
              slip) when logging a meeting signoff.
            </p>
          </div>
          <Toggle
            id="require-meeting-photo"
            checked={requireMeetingPhoto}
            onCheckedChange={setRequireMeetingPhoto}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
    </>
  );
}
