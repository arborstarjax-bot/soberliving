"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// BeforeInstallPromptEvent isn't in lib.dom yet — declared minimally.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Sidebar entry that lets the user install Sober Living as a PWA.
//
// Behavior:
//   - Chromium/Edge/Android: listens for `beforeinstallprompt`,
//     intercepts it, and triggers the native install dialog when the
//     user clicks.
//   - iOS Safari: has no programmatic install API, so we show a
//     modal with Share Sheet → "Add to Home Screen" instructions.
//   - Already-installed PWAs (standalone display-mode) hide the button
//     entirely to avoid confusing "install again" prompts.
export function InstallAppButton({
  className,
}: {
  className?: string;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Defer the initial environment reads off the synchronous effect
    // body so React's "no setState in effect" rule is happy — these
    // values are read from the browser once at mount and only change
    // via the event listeners below, so the microtask delay is
    // imperceptible.
    queueMicrotask(() => {
      setIsStandalone(
        window.matchMedia("(display-mode: standalone)").matches ||
          // Safari iOS legacy flag
          (window.navigator as unknown as { standalone?: boolean })
            .standalone === true
      );

      const ua = window.navigator.userAgent;
      // iPad on iOS 13+ reports MacIntel; check touch capability too.
      const iosLike =
        /iPhone|iPad|iPod/.test(ua) ||
        (ua.includes("Macintosh") && "ontouchend" in document);
      setIsIos(iosLike);
    });

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (isStandalone) return null;

  // iOS: show helper modal with manual steps.
  if (isIos && !deferred) {
    return (
      <Dialog open={iosHelpOpen} onOpenChange={setIosHelpOpen}>
        <DialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className={className}
              aria-label="Install Sober Living on this device"
            />
          }
        >
          <Download className="h-4 w-4 mr-2" />
          Install App
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install on iPhone / iPad</DialogTitle>
            <DialogDescription>
              iOS doesn&apos;t allow apps to install themselves — follow
              these two steps in Safari:
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                1
              </span>
              <span>
                Tap the <Share className="inline h-4 w-4 align-text-bottom" />{" "}
                <strong>Share</strong> button in Safari&apos;s toolbar.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                2
              </span>
              <span>
                Scroll down and choose{" "}
                <strong>Add to Home Screen</strong>, then tap{" "}
                <strong>Add</strong>.
              </span>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Sober Living will appear as its own icon and open full-screen
            without the Safari toolbar.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  // Non-iOS browsers that haven't fired beforeinstallprompt yet: hide
  // to avoid a dead button. (Chrome only fires the event once engagement
  // heuristics are met; unsupported browsers never fire it.)
  if (!deferred) return null;

  async function onInstallClick() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setDeferred(null);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={onInstallClick}
    >
      <Download className="h-4 w-4 mr-2" />
      Install App
    </Button>
  );
}
