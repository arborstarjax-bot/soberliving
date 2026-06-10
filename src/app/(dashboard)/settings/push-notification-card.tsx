"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, ClipboardCheck, MessageSquare, ShieldAlert, SendHorizontal } from "lucide-react";
import { subscribePush, unsubscribePush, updatePushPreference, sendTestPush } from "./push-actions";

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

type PushState = "loading" | "unsupported" | "denied" | "off" | "on";

interface PushNotificationCardProps {
  initialPrefs: {
    push_chores: boolean;
    push_bulletin: boolean;
    push_discipline: boolean;
  };
}

function getInitialPushState(): PushState {
  if (typeof window === "undefined") return "loading";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  // Actual subscription check is async — handled in the effect.
  return "loading";
}

export function PushNotificationCard({ initialPrefs }: PushNotificationCardProps) {
  const [pushState, setPushState] = useState<PushState>(getInitialPushState);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [pending, startTransition] = useTransition();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testPending, setTestPending] = useState(false);

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
    (key: "push_chores" | "push_bulletin" | "push_discipline", value: boolean) => {
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
              <div className="mb-3">
                <button
                  type="button"
                  disabled={testPending}
                  onClick={async () => {
                    setTestPending(true);
                    setTestResult(null);
                    try {
                      const result = await sendTestPush();
                      const cfg = (result as Record<string, unknown>).config as
                        | { publicKey: string; privateKey: string; subject: string }
                        | undefined;
                      const configLines = cfg
                        ? [
                            "",
                            "--- Server Config ---",
                            `Public: ${cfg.publicKey}`,
                            `Private: ${cfg.privateKey}`,
                            `Subject: ${cfg.subject}`,
                          ]
                        : [];
                      if ("error" in result && result.error) {
                        setTestResult(`Error: ${result.error}${configLines.join("\n")}`);
                      } else if ("summary" in result) {
                        const lines = [result.summary as string];
                        const devices = (result as Record<string, unknown>).devices as
                          | { status: string; detail: string }[]
                          | undefined;
                        if (devices) {
                          for (const d of devices) {
                            lines.push(`${d.status === "delivered" ? "✓" : "✗"} ${d.detail}`);
                          }
                        }
                        const stale = (result as Record<string, unknown>).staleRemoved as number | undefined;
                        if (stale && stale > 0) {
                          lines.push(`(${stale} stale endpoint(s) cleaned up)`);
                        }
                        lines.push(...configLines);
                        setTestResult(lines.join("\n"));
                      }
                    } catch (err) {
                      setTestResult(`Failed: ${String(err)}`);
                    } finally {
                      setTestPending(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <SendHorizontal className="h-4 w-4" />
                  {testPending ? "Sending…" : "Send Test Notification"}
                </button>
                {testResult && (
                  <pre className={`mt-2 text-xs whitespace-pre-wrap ${
                    testResult.startsWith("Error") || testResult.startsWith("Failed") || testResult.includes("0 delivered")
                      ? "text-destructive"
                      : "text-green-600"
                  }`}>
                    {testResult}
                  </pre>
                )}
              </div>
            )}

            {showToggles && (
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
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
