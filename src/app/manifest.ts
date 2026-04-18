import type { MetadataRoute } from "next";

// Web App Manifest — makes the app installable on mobile/desktop
// ("Add to Home Screen" on iOS, "Install app" on Chromium).
//
// Notes on choices:
// - `display: "standalone"` hides the browser chrome when launched
//   from the home screen so it feels like a native app.
// - `start_url: "/dashboard"` lands installed users directly on the
//   dashboard instead of the marketing root; auth middleware will
//   still redirect unauthenticated users to /login.
// - `theme_color` matches the sidebar (--sidebar in globals.css,
//   oklch(0.285 0.045 255) ≈ #1e2a44) so the OS status bar blends
//   with the in-app chrome.
// - `background_color` is the light off-white (--background,
//   oklch(0.965 0.003 260) ≈ #f5f4f1) used for the splash screen
//   while the app boots.
// - Maskable icon lets Android adaptive-icon systems crop/round
//   without clipping the "SL" glyph.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sober Living",
    short_name: "Sober Living",
    description:
      "Sober living house management — intake, housing, payments, chores, and discipline in one app.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f4f1",
    theme_color: "#1e2a44",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
