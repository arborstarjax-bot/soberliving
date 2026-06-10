"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, ClipboardCheck, MessageSquare, ShieldAlert, DoorOpen, FileText } from "lucide-react";
import { subscribePush, unsubscribePush, updatePushPreference, updateSignInOutPreference } from "./push-actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// Convert a URL-safe base64 VAPID key to a Uint8Array for the Push API.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

interface ToggleRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (v: boolean) => void;
}

function ToggleRow({ icon: Icon, label, hint, checked, disabled, onToggle }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          {label}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onToggle(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-input"
        }`}
      >
        <span
          className={`pointer-events-none block h-[18px] w-[18px] rounded-full bg-background shadow-sm ring-0 transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-[3px]"
          }`}
        />
      </button>
    </div>
  );
}

type SignInOutPref = "off" | "all" | "curfew_only";

interface RadioOptionProps {
  label: string;
  value: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

function RadioOption({ label, value, selected, disabled, onSelect }: RadioOptionProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm">
      <input
        type="radio"
        name="push_sign_in_out"
        value={value}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="h-4 w-4 text-primary border-border focus:ring-primary"
      />
      {label}
    </label>
  );
}

type PushState = "loading" | "unsupported" | "denied" | "off" | "on";

interface PushNotificationCardProps {
  initialPrefs: {
    push_chores: boolean;
    push_bulletin: boolean;
    push_discipline: boolean;
    push_sign_in_out: string;
    push_intakes: boolean;
  };
  userRole: string;
}

function getInitialPushState(): PushState {
  if (typeof window === "undefined") return "loading";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  // Actual subscription check is async — handled in the effect.
  return "loading";
}

export function PushNotificationCard({ initialPrefs, userRole }: PushNotificationCardProps) {
  const [pushState, setPushState] = useState<PushState>(getInitialPushState);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [pending, startTransition] = useTransition();

  const isStaff = userRole === "admin" || userRole === "manager";

  // Check actual push subscription state (async).
  useEffect(() => {
    if (pushState !== "loading") return;

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setPushState(sub ? "on" : "off");
      });
    });
  }, [pushState]);

  const handleMasterToggle = useCallback(
    async (enable: boolean) => {
      if (enable) {
        // Request permission + subscribe.
        const perm = await Notification.requestPermission();
        if (perm === "denied") {
          setPushState("denied");
          return;
        }
        if (perm !== "granted") return;

        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
        });

        const json = sub.toJSON();
        const result = await subscribePush({
          endpoint: json.endpoint!,
          keys: {
            p256dh: json.keys!.p256dh!,
            auth: json.keys!.auth!,
          },
        });

        if ("error" in result && result.error) {
          console.error("[push] subscribe failed:", result.error);
          return;
        }
        setPushState("on");
      } else {
        // Unsubscribe.
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribePush(sub.endpoint);
          await sub.unsubscribe();
        }
        setPushState("off");
      }
    },
    []
  );

  const handlePrefToggle = useCallback(
    (key: "push_chores" | "push_bulletin" | "push_discipline" | "push_intakes", value: boolean) => {
      setPrefs((p) => ({ ...p, [key]: value }));
      startTransition(async () => {
        const result = await updatePushPreference(key, value);
        if ("error" in result && result.error) {
          // Revert on failure.
          setPrefs((p) => ({ ...p, [key]: !value }));
        }
      });
    },
    []
  );

  const handleSignInOutChange = useCallback(
    (value: SignInOutPref) => {
      const prev = prefs.push_sign_in_out;
      setPrefs((p) => ({ ...p, push_sign_in_out: value }));
      startTransition(async () => {
        const result = await updateSignInOutPreference(value);
        if ("error" in result && result.error) {
          setPrefs((p) => ({ ...p, push_sign_in_out: prev }));
        }
      });
    },
    [prefs.push_sign_in_out]
  );

  const isOn = pushState === "on";
  const showToggles = isOn;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Push Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        {pushState === "unsupported" && (
          <p className="text-sm text-muted-foreground">
            Push notifications are not supported on this browser.
            Install the app to your home screen for the best experience.
          </p>
        )}

        {pushState === "denied" && (
          <p className="text-sm text-muted-foreground">
            Push notifications are blocked. To re-enable, update your
            browser&apos;s notification settings for this site.
          </p>
        )}

        {pushState === "loading" && (
          <p className="text-sm text-muted-foreground">Checking notification support…</p>
        )}

        {(pushState === "on" || pushState === "off") && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Get notified on your phone when important things happen.
            </p>

            <div className="rounded-lg bg-muted/50 p-3 mb-3">
              <ToggleRow
                icon={Bell}
                label="Enable Push Notifications"
                hint={isOn ? "Notifications are active on this device" : "Turn on to receive alerts"}
                checked={isOn}
                onToggle={handleMasterToggle}
              />
            </div>

            {showToggles && (
              <>
                <div className="space-y-0">
                  <ToggleRow
                    icon={ClipboardCheck}
                    label="Chore Reminders"
                    hint="Notified at noon on the day your chores are due"
                    checked={prefs.push_chores}
                    disabled={pending}
                    onToggle={(v) => handlePrefToggle("push_chores", v)}
                  />
                  <ToggleRow
                    icon={MessageSquare}
                    label="Community Notices"
                    hint="When a new bulletin or community notice is posted"
                    checked={prefs.push_bulletin}
                    disabled={pending}
                    onToggle={(v) => handlePrefToggle("push_bulletin", v)}
                  />
                  <ToggleRow
                    icon={ShieldAlert}
                    label="Demerits & Warnings"
                    hint="When you receive a demerit or a warning"
                    checked={prefs.push_discipline}
                    disabled={pending}
                    onToggle={(v) => handlePrefToggle("push_discipline", v)}
                  />
                </div>

                {isStaff && (
                  <>
                    <div className="mt-4 mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Staff Notifications
                      </p>
                    </div>

                    <div className="space-y-0">
                      {/* Sign-In/Out — radio group */}
                      <div className="py-3 border-b border-border">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <DoorOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                          Sign-In / Sign-Out Alerts
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                          Get notified when residents sign in or out
                        </p>
                        <div className="flex flex-col gap-2 pl-6">
                          <RadioOption
                            label="Off"
                            value="off"
                            selected={prefs.push_sign_in_out === "off"}
                            disabled={pending}
                            onSelect={() => handleSignInOutChange("off")}
                          />
                          <RadioOption
                            label="All sign-ins and sign-outs"
                            value="all"
                            selected={prefs.push_sign_in_out === "all"}
                            disabled={pending}
                            onSelect={() => handleSignInOutChange("all")}
                          />
                          <RadioOption
                            label="Only past-curfew sign-ins"
                            value="curfew_only"
                            selected={prefs.push_sign_in_out === "curfew_only"}
                            disabled={pending}
                            onSelect={() => handleSignInOutChange("curfew_only")}
                          />
                        </div>
                      </div>

                      <ToggleRow
                        icon={FileText}
                        label="New Intake Applications"
                        hint="When an applicant submits their intake packet"
                        checked={prefs.push_intakes}
                        disabled={pending}
                        onToggle={(v) => handlePrefToggle("push_intakes", v)}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
