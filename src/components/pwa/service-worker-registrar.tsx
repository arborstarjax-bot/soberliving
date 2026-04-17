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
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
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
