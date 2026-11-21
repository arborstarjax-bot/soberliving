// Sober Living PWA service worker — v4
//
// Strategy:
//   _next/static/*  → CacheFirst  (content-addressed, never changes)
//   navigations     → NetworkOnly  (auth-gated, caching causes redirect loops)
//   everything else → StaleWhileRevalidate for same-origin GETs
//
// v3 bumps from v2 to add aggressive _next/static caching which
// eliminates JS/CSS re-downloads on repeat visits — the single biggest
// lever for making the app feel instant after the first load.
// v4 adds push notification support.
const CACHE_VERSION = "v4";
const STATIC_CACHE = `sl-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `sl-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch {
        // Offline page might not exist on first deploy; ignore.
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Nuke stale caches from older SW versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) =>
            (k.startsWith("sl-static-") || k.startsWith("sl-runtime-")) &&
            k !== STATIC_CACHE &&
            k !== RUNTIME_CACHE
          )
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// --- Push notifications ---
// The server sends a JSON payload with { title, body, url?, icon? }.
// We show a system notification and, on click, focus or open the target URL.
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "HouseFlow", body: event.data.text() };
  }

  const { title = "HouseFlow", body = "", url, icon } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (new URL(client.url).pathname === targetUrl && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only GETs are safe to cache / replay.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip cross-origin requests.
  if (url.origin !== self.location.origin) return;

  // Skip Next.js HMR/dev endpoints.
  if (
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.pathname.startsWith("/_next/static/chunks/webpack")
  ) {
    return;
  }

  // --- _next/static/*: CacheFirst ---
  // These are content-addressed (hashed filenames) so once cached they
  // never need to be re-fetched. This is the key difference from v2:
  // previously these went through the network on every visit.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.status === 200) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      })()
    );
    return;
  }

  // --- Navigations: NetworkOnly + offline fallback ---
  // Auth-gated routes can return redirect responses that become stale.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // --- Static assets: StaleWhileRevalidate ---
  if (
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => undefined);
        return cached || (await network) || new Response("", { status: 504 });
      })()
    );
  }
});
