"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  houses = [],
}: {
  workspaceId: string;
  settings: WorkspaceSettings | null;
  houses?: { id: string; name: string }[];
}) {
  type CheckInSchedule = {
    id: string;
    label?: string;
    house_ids?: string[];
    frequency?: "daily" | "weekly" | "biweekly" | "monthly";
    day_of_week?: number;
    day_of_month?: number;
    enabled?: boolean;
    last_sent_on?: string;
  };
  const [schedules, setSchedules] = useState<CheckInSchedule[]>(
    settings?.check_in_schedules ?? []
  );
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
  const [autoCycleFrequency, setAutoCycleFrequency] = useState(
    settings?.auto_cycle_frequency ?? "weekly"
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
  const [intakeMode, setIntakeMode] = useState<"auto" | "requires_signoff">(
    settings?.intake_mode ?? "requires_signoff"
  );
  const [intakeSteps, setIntakeSteps] = useState<
    { id: string; label: string; required?: boolean }[]
  >(settings?.intake_steps ?? []);
  const [rulesText, setRulesText] = useState(settings?.rules_text ?? "");
  const [directorName, setDirectorName] = useState(settings?.director_name ?? "");
  const [requireRuleCheckoff, setRequireRuleCheckoff] = useState(
    settings?.require_rule_checkoff ?? false
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

  type Field = keyof ReturnType<typeof buildPayload>;

  function buildPayload() {
    return {
      require_application: requireApp,
      require_commitment: requireCommitment,
      enable_payments: enablePayments,
      auto_cycle_chores: autoCycleChores,
      auto_cycle_frequency: autoCycleFrequency,
      auto_demerit_missed_chores: autoDemerit,
      auto_demerit_missed_meetings: autoDemeritMeetings,
      auto_demerit_missed_curfew: autoDemeritCurfew,
      require_chore_photo: requireChorePhoto,
      require_meeting_photo: requireMeetingPhoto,
      enabled_modules: enabledModules,
      pass_approver: passApprover,
      intake_mode: intakeMode,
      intake_steps: intakeSteps,
      rules_text: rulesText || null,
      require_rule_checkoff: requireRuleCheckoff,
      director_name: directorName || null,
      check_in_schedules: schedules,
      resident_modules: residentModules,
      reminder_settings: reminders,
    };
  }

  // Each section's Save button writes only its own columns, so a save in
  // one area can't fail on another area's columns the database lacks.
  function handleSave(fields: Field[]) {
    const all = buildPayload();
    const payload: Record<string, unknown> = {};
    for (const f of fields) payload[f] = all[f];
    // Only write the frequency column when auto-cycle is on — older
    // databases may not have the column yet, and it is unused otherwise.
    if (!autoCycleChores) delete payload.auto_cycle_frequency;
    startTransition(async () => {
      const result = await updateWorkspaceSettings(
        workspaceId,
        payload as Parameters<typeof updateWorkspaceSettings>[1]
      );
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
          <Button onClick={() => handleSave(["require_application", "require_commitment", "enable_payments"])} disabled={pending}>
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
        {autoCycleChores && (
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="auto-cycle-frequency">Auto-Cycle Frequency</Label>
              <p className="text-sm text-muted-foreground">
                How often a new rotation starts — each auto-created cycle lasts
                this long (monthly = every 4 weeks).
              </p>
            </div>
            <select
              id="auto-cycle-frequency"
              value={autoCycleFrequency}
              onChange={(e) =>
                setAutoCycleFrequency(
                  e.target.value as "daily" | "weekly" | "biweekly" | "monthly"
                )
              }
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        )}

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
          <Button onClick={() => handleSave(["auto_cycle_chores", "auto_cycle_frequency", "auto_demerit_missed_chores", "auto_demerit_missed_meetings", "auto_demerit_missed_curfew", "require_chore_photo", "require_meeting_photo"])} disabled={pending}>
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
          <Button onClick={() => handleSave(["pass_approver"])} disabled={pending}>
            {pending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Intake Pipeline</CardTitle>
        <CardDescription>
          How new residents enter — and what they must complete
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>When someone joins via the invite link</Label>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="intake-mode"
                checked={intakeMode === "auto"}
                onChange={() => setIntakeMode("auto")}
              />
              <span>
                <strong>Auto entry</strong> — they join the workspace
                immediately and can use the app right away.
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="intake-mode"
                checked={intakeMode === "requires_signoff"}
                onChange={() => setIntakeMode("requires_signoff")}
              />
              <span>
                <strong>Require intake signoff</strong> — an admin must
                approve them before they get in.
              </span>
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Intake Checklist</Label>
          <p className="text-sm text-muted-foreground">
            Steps staff mark off during intake — e.g. paperwork signed,
            UA collected, rent collected, house walk done.
          </p>
          {intakeSteps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              <Input
                value={step.label}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setIntakeSteps((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x
                    )
                  )
                }
              />
              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={!!step.required}
                  onChange={(e) =>
                    setIntakeSteps((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, required: e.target.checked } : x
                      )
                    )
                  }
                />
                Required
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setIntakeSteps((prev) => prev.filter((_, j) => j !== i))
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setIntakeSteps((prev) => [
                ...prev,
                { id: `step-${Date.now()}`, label: "", required: false },
              ])
            }
          >
            Add Step
          </Button>
        </div>

        <div className="space-y-3">
          <Label htmlFor="rules-text">Rules Sheet</Label>
          <p className="text-sm text-muted-foreground">
            House rules shown to residents — write them here, or flag a
            vault document for intake acknowledgment instead.
          </p>
          <textarea
            id="rules-text"
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
            rows={5}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            placeholder="Enter house rules, one per line…"
          />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="require-rule-checkoff">
                Require rule checkoff
              </Label>
              <p className="text-sm text-muted-foreground">
                Resident must check off every rule before intake
                completes
              </p>
            </div>
            <Toggle
              id="require-rule-checkoff"
              checked={requireRuleCheckoff}
              onCheckedChange={setRequireRuleCheckoff}
            />
          </div>

          <div>
            <Label htmlFor="director-name">Executive Director name</Label>
            <p className="text-sm text-muted-foreground">
              Printed on the commitment agreement as the counter-signing
              &quot;Executive Director&quot;.
            </p>
            <input
              id="director-name"
              value={directorName}
              onChange={(e) => setDirectorName(e.target.value)}
              className="mt-2 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="e.g. James Kerr"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => handleSave(["intake_mode", "intake_steps", "rules_text", "require_rule_checkoff", "director_name"])} disabled={pending}>
            {pending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Check-In Schedules</CardTitle>
        <CardDescription>
          Automatically send check-ins to houses on a cadence
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {schedules.map((sch, i) => (
          <div key={sch.id} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Input
                value={sch.label ?? ""}
                placeholder="Weekly check-in"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSchedules((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x
                    )
                  )
                }
              />
              <select
                value={sch.frequency ?? "weekly"}
                onChange={(e) =>
                  setSchedules((prev) =>
                    prev.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            frequency: e.target.value as
                              | "daily"
                              | "weekly"
                              | "biweekly"
                              | "monthly",
                          }
                        : x
                    )
                  )
                }
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
              {(sch.frequency === "weekly" || sch.frequency === "biweekly") && (
                <select
                  value={sch.day_of_week ?? 1}
                  onChange={(e) =>
                    setSchedules((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, day_of_week: Number(e.target.value) } : x
                      )
                    )
                  }
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, di) => (
                    <option key={di} value={di}>{d}</option>
                  ))}
                </select>
              )}
              {sch.frequency === "monthly" && (
                <select
                  value={sch.day_of_month ?? 1}
                  onChange={(e) =>
                    setSchedules((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, day_of_month: Number(e.target.value) } : x
                      )
                    )
                  }
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {Array.from({ length: 28 }, (_, d) => (
                    <option key={d + 1} value={d + 1}>{`Day ${d + 1}`}</option>
                  ))}
                </select>
              )}
              <Toggle
                id={`sched-${sch.id}`}
                checked={sch.enabled !== false}
                onCheckedChange={(v) =>
                  setSchedules((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, enabled: v } : x))
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSchedules((prev) => prev.filter((_, j) => j !== i))
                }
              >
                Remove
              </Button>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {houses.map((h) => (
                <label key={h.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={(sch.house_ids ?? []).includes(h.id)}
                    onChange={(e) =>
                      setSchedules((prev) =>
                        prev.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                house_ids: e.target.checked
                                  ? [...(x.house_ids ?? []), h.id]
                                  : (x.house_ids ?? []).filter(
                                      (id) => id !== h.id
                                    ),
                              }
                            : x
                        )
                      )
                    }
                  />
                  {h.name}
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setSchedules((prev) => [
                ...prev,
                {
                  id: `sched-${Date.now()}`,
                  label: "",
                  house_ids: [],
                  frequency: "weekly",
                  day_of_week: 1,
                  enabled: true,
                },
              ])
            }
          >
            Add Schedule
          </Button>
          <Button onClick={() => handleSave(["check_in_schedules"])} disabled={pending}>
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
          <Button onClick={() => handleSave(["resident_modules"])} disabled={pending}>
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
          <Button onClick={() => handleSave(["reminder_settings"])} disabled={pending}>
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
          <Button onClick={() => handleSave(["enabled_modules"])} disabled={pending}>
            {pending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
    </>
  );
}
