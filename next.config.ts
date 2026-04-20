import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  // Serve the service worker with headers that guarantee browsers
  // re-check it on every navigation instead of using the default
  // static-asset cache (which can pin a stale SW for hours). Without
  // this, a SW version bump doesn't reach installed clients until
  // their cached /sw.js expires — which is how PWA users ended up
  // stuck on a pre-fix SW that was replaying redirect loops from
  // its runtime cache.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  // Next.js 16 blocks cross-origin requests to dev resources (HMR
  // websocket, /_next/*) by default. When testing the app on a phone
  // connected to the same Wi-Fi as the dev machine, the phone hits
  // http://<LAN-IP>:3000 and every dev resource is rejected — so
  // client JS never hydrates and every button / tab is dead on
  // mobile even though SSR still renders the page.
  //
  // Next's matcher uses dot-segmented wildcards (like DNS globs), not
  // CIDR. Covering the common RFC1918 private ranges (10.x.x.x,
  // 172.16-31.x.x, 192.168.x.x) means any teammate testing on the
  // same Wi-Fi as their dev machine works without touching config.
  // Only affects `next dev`; production ignores this.
  allowedDevOrigins: [
    "10.*.*.*",
    "172.16.*.*", "172.17.*.*", "172.18.*.*", "172.19.*.*",
    "172.20.*.*", "172.21.*.*", "172.22.*.*", "172.23.*.*",
    "172.24.*.*", "172.25.*.*", "172.26.*.*", "172.27.*.*",
    "172.28.*.*", "172.29.*.*", "172.30.*.*", "172.31.*.*",
    "192.168.*.*",
    "*.local",
  ],
};

export default nextConfig;
