# iOS Wrap (Capacitor)

The iOS app is a Capacitor shell that loads `https://soberliving.vercel.app`
in a WebView — no static export, so server actions, auth, and realtime work
unchanged.

## What's already done (in repo)

- `capacitor.config.ts` — appId `com.houseflow.app`, remote `server.url`,
  splash theme, push presentation options.
- `ios/` — generated Xcode project (`npx cap add ios`).
- `ios/App/App/Info.plist` — camera, photo-library read/add usage strings,
  `remote-notification` background mode.
- `ios/App/App/PrivacyInfo.xcprivacy` — Apple privacy manifest (no tracking;
  name/email/userID/photos declared, app-functionality only).
- `Assets.xcassets` — app icon (1024²) and centered splash images.
- Plugins installed: `@capacitor/app`, `push-notifications`, `splash-screen`.

## Remaining steps (require macOS + Xcode + Apple Developer account)

1. `npm run build && npx cap sync ios`
2. `cd ios/App && pod install` then open `App.xcworkspace` in Xcode.
3. Signing: set Team to your Apple Developer account; bundle ID is
   `com.houseflow.app` — register it in the dev portal.
4. Capabilities tab: enable **Push Notifications** (adds `aps-environment`
   entitlement). For real APNs delivery we'd need to swap web-push for
   APNs tokens — the in-app notification feed works regardless, so this
   can wait or use a later build.
5. Universal links (optional): add `applinks:soberliving.vercel.app`
   associated-domain entitlement and host an `apple-app-site-association`
   file at `/.well-known/` on the site.
6. Product → Archive → Distribute to App Store Connect.

## App Store Connect checklist

- App Privacy: matches PrivacyInfo.xcprivacy — name, email, user ID,
  photos; no tracking → no ATT prompt needed.
- Account deletion URL metadata: `https://soberliving.vercel.app/delete-account`
- Privacy policy URL: `https://soberliving.vercel.app/privacy`
- Business model is B2B SaaS → external Stripe billing is allowed
  (reader/goods-services exemption; note it in review notes).
- Provide a demo workspace login seeded with fake residents only.
