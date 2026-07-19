"use client";

import { useEffect } from "react";

// Mounts once at the app root and registers /sw.js if the browser
// supports service workers. Gated on NODE_ENV === "production" because
// the Next dev server hot-reloads chunks and an active SW can end up
// serving stale JS during development.
//
// The registration is intentionally fire-and-forget: failures are
// logged but never surfaced to the user, since a broken SW must not
// break the app itself.
//
// After registration, we call .update() to check for a newer sw.js on
// every page load. Without this, browsers only check for updates every
// ~24 hours, which means new features (like push support) can take a
// day to activate on existing installs.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          // Force an update check so new SW versions activate promptly.
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.warn("[pwa] service worker registration failed", err);
        });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
