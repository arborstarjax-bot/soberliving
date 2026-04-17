import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sober Living",
  description: "Sober living house management platform",
  // iOS home-screen / PWA meta. `apple-mobile-web-app-capable` puts the
  // app into standalone mode on iOS when added to home screen; the
  // status bar style keeps the notch area legible against our sidebar
  // theme color. Once we ship the PWA manifest + icons, the apple
  // touch icon reference below will pick them up automatically.
  appleWebApp: {
    capable: true,
    title: "Sober Living",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    // Stop iOS from auto-linkifying phone-like number strings
    // (demerit points, chore ids, etc) as tel: links.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Prevent pinch-zoom-induced layout shifts on iOS without disabling
  // the system accessibility zoom (AssistiveTouch → Zoom still works).
  maximumScale: 1,
  userScalable: false,
  // `cover` lets the page draw under the notch / home-indicator so we
  // can paint the dashboard theme edge-to-edge; the actual content is
  // pushed inside safe-area-inset padding in the dashboard layout.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
