"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateWorkspaceSettings } from "./actions";
import { WORKSPACE_MODULES } from "@/lib/modules";
import { REMINDER_TYPES } from "@/lib/reminders";
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
  const [autoDemeritMeetings, setAutoDemeritMeetings] = useState(
    settings?.auto_demerit_missed_meetings ?? false
  );
  const [autoDemeritCurfew, setAutoDemeritCurfew] = useState(
    settings?.auto_demerit_missed_curfew ?? false
  );
  const [requireChorePhoto, setRequireChorePhoto] = useState(
    settings?.require_chore_photo ?? false
  );
  const [requireMeetingPhoto, setRequireMeetingPhoto] = useState(
    settings?.require_meeting_photo ?? false
  );
  const [enabledModules, setEnabledModules] = useState<string[]>(
    settings?.enabled_modules ?? WORKSPACE_MODULES.map((m) => m.slug)
  );
  const [residentModules, setResidentModules] = useState<string[]>(
    settings?.resident_modules ?? WORKSPACE_MODULES.map((m) => m.slug)
  );
  const [reminders, setReminders] = useState<
    Record<string, { enabled: boolean; timing: "day_of" | "day_before" }>
  >(() => {
    const out: Record<
      string,
      { enabled: boolean; timing: "day_of" | "day_before" }
    > = {};
    for (const t of REMINDER_TYPES) {
      const saved = settings?.reminder_settings?.[t.slug];
      out[t.slug] = {
        enabled: saved?.enabled !== false,
        timing: saved?.timing === "day_before" ? "day_before" : "day_of",
      };
    }
    return out;
  });
  const [passApprover, setPassApprover] = useState<
    "manager" | "admin" | "both"
  >(settings?.pass_approver ?? "both");
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
        auto_demerit_missed_meetings: autoDemeritMeetings,
        auto_demerit_missed_curfew: autoDemeritCurfew,
        require_chore_photo: requireChorePhoto,
        require_meeting_photo: requireMeetingPhoto,
        enabled_modules: enabledModules,
        pass_approver: passApprover,
        resident_modules: residentModules,
        reminder_settings: reminders,
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
            <Label htmlFor="auto-demerit-meetings">
              Auto-Demerit on Missed Meeting
            </Label>
            <p className="text-sm text-muted-foreground">
              Issue a 1-point demerit at week&apos;s end when a resident
              logged no meeting that week.
            </p>
          </div>
          <Toggle
            id="auto-demerit-meetings"
            checked={autoDemeritMeetings}
            onCheckedChange={setAutoDemeritMeetings}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="auto-demerit-curfew">
              Auto-Demerit on Missed Curfew
            </Label>
            <p className="text-sm text-muted-foreground">
              Issue a 1-point demerit when a resident is still signed
              out past curfew.
            </p>
          </div>
          <Toggle
            id="auto-demerit-curfew"
            checked={autoDemeritCurfew}
            onCheckedChange={setAutoDemeritCurfew}
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

    <Card>
      <CardHeader>
        <CardTitle>Passes</CardTitle>
        <CardDescription>
          Who gives the final approval on an overnight pass
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          {(
            [
              {
                value: "both",
                label: "House Manager, then Admin",
                desc: "A house manager approves first, then an admin gives the final approval.",
              },
              {
                value: "manager",
                label: "House Manager only",
                desc: "The house manager's approval is final — no admin step.",
              },
              {
                value: "admin",
                label: "Admin only",
                desc: "Passes skip the house manager and go straight to an admin.",
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                passApprover === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <input
                type="radio"
                name="pass-approver"
                value={opt.value}
                checked={passApprover === opt.value}
                onChange={() => setPassApprover(opt.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-sm text-muted-foreground">
                  {opt.desc}
                </span>
              </span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            The covering resident always approves first — this controls who
            reviews the pass after them.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Resident View</CardTitle>
        <CardDescription>
          Which modules residents can see. Staff always see every
          enabled module.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {WORKSPACE_MODULES.map((m) => (
          <div
            key={m.slug}
            className="flex items-center justify-between"
          >
            <Label htmlFor={`resident-module-${m.slug}`}>
              {m.label}
            </Label>
            <Toggle
              id={`resident-module-${m.slug}`}
              checked={residentModules.includes(m.slug)}
              onCheckedChange={(checked) =>
                setResidentModules((prev) =>
                  checked
                    ? [...new Set([...prev, m.slug])]
                    : prev.filter((x) => x !== m.slug)
                )
              }
            />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Reminders</CardTitle>
        <CardDescription>
          Which automated reminders residents receive, and when
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {REMINDER_TYPES.map((t) => {
          const r = reminders[t.slug];
          return (
            <div
              key={t.slug}
              className="flex items-start justify-between gap-4"
            >
              <div className="space-y-2">
                <Label htmlFor={`reminder-${t.slug}`}>{t.label}</Label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`timing-${t.slug}`}
                      checked={r.timing === "day_of"}
                      onChange={() =>
                        setReminders((prev) => ({
                          ...prev,
                          [t.slug]: { ...prev[t.slug], timing: "day_of" },
                        }))
                      }
                    />
                    Day of
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`timing-${t.slug}`}
                      checked={r.timing === "day_before"}
                      onChange={() =>
                        setReminders((prev) => ({
                          ...prev,
                          [t.slug]: { ...prev[t.slug], timing: "day_before" },
                        }))
                      }
                    />
                    24 hours before
                  </label>
                </div>
              </div>
              <Toggle
                id={`reminder-${t.slug}`}
                checked={r.enabled}
                onCheckedChange={(v) =>
                  setReminders((prev) => ({
                    ...prev,
                    [t.slug]: { ...prev[t.slug], enabled: v },
                  }))
                }
              />
            </div>
          );
        })}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Modules</CardTitle>
        <CardDescription>
          Turn entire app sections on or off for this workspace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {WORKSPACE_MODULES.map((mod) => (
          <div key={mod.slug} className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={`module-${mod.slug}`}>{mod.label}</Label>
            </div>
            <Toggle
              id={`module-${mod.slug}`}
              checked={enabledModules.includes(mod.slug)}
              onCheckedChange={(v) =>
                setEnabledModules((prev) =>
                  v ? [...prev, mod.slug] : prev.filter((s) => s !== mod.slug)
                )
              }
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Disabled modules disappear from the sidebar and their pages redirect
          to Home for everyone in this workspace.
        </p>
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
