import type { CapacitorConfig } from "@capacitor/cli";

// Wraps the live Next.js app — no static export needed; server actions,
// auth, and realtime keep working because the WebView loads the site.
const config: CapacitorConfig = {
  appId: "com.houseflow.app",
  appName: "HouseFlow",
  webDir: "public",
  server: {
    url: "https://soberliving.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    allowsLinkPreview: false,
    scheme: "HouseFlow",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0f172a",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
