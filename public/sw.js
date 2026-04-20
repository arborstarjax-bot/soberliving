// Minimal service worker for the Sober Living PWA.
//
// What this does:
//   - Registers as a service worker so the browser treats the app as
//     installable (meets the PWA install criteria alongside manifest.ts).
//   - Takes control of open tabs as soon as it activates so the first
//     install doesn't require a page reload.
//   - Provides a network-first fetch strategy with a tiny runtime cache
//     for same-origin GETs, so recently-viewed screens come back fast
//     on flaky connections. Write requests (POST/PUT/DELETE) and cross-
//     origin requests bypass the cache entirely.
//   - Falls back to /offline for navigations when the network is dead,
//     so installed users don't see the browser's dino page.
//
// What this deliberately does NOT do (yet):
//   - Precache the whole app shell. Next.js emits hashed assets that
//     change every deploy; precaching would require build-time
//     integration (e.g. Serwist/Workbox). A runtime cache is safer for
//     now and keeps this file deploy-agnostic.
//   - Push notifications. Wire those up when we actually have a
//     backend endpoint to send from.

// Bumped to v2 to purge stale navigation-response caches from v1 that
// captured redirect loops (dashboard ↔ acknowledge) before the gate
// fixes in #142. Every CACHE_VERSION bump invalidates the prior
// runtime cache on activation via the cleanup step below.
const CACHE_VERSION = "v2";
const RUNTIME_CACHE = `sl-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  // Pre-warm the offline fallback so the very first offline
  // navigation has something to render.
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
      // Nuke stale runtime caches from older SW versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("sl-runtime-") && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only GETs are safe to cache / replay.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip cross-origin (Supabase, fonts CDN, etc) — let the browser
  // and those services' own cache headers handle them.
  if (url.origin !== self.location.origin) return;

  // Skip Next.js internals that shouldn't be cached by us (RSC payloads,
  // HMR, dev-only endpoints). Next manages its own caching for these.
  if (
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.pathname.startsWith("/_next/static/chunks/webpack")
  ) {
    return;
  }

  // Navigations: network-only, fall back to the precached /offline
  // page if the network is unreachable. We deliberately do NOT cache
  // navigation responses — the app's routes are auth-gated and a
  // cached HTML/RSC response can contain a `redirect()` instruction
  // that later becomes stale (e.g. "go sign commitment" cached,
  // then the resident signs, but the cache replays the old redirect
  // on the next navigation). Caching those responses produced
  // redirect loops on deployed fixes because the SW kept replaying
  // pre-fix behavior. Static assets are still cached below.
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

  // Static-ish assets: stale-while-revalidate.
  if (
    url.pathname.startsWith("/_next/static/") ||
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
