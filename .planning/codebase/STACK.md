# Technology Stack

**Analysis Date:** 2026-05-11

## Languages

**Primary:**
- TypeScript ~5.4.5 — All web app source under `src/` (strict mode enabled in `tsconfig.json`)
- SQL (PostgreSQL dialect) — Supabase schema and triggers under `supabase/`

**Secondary:**
- Swift — iOS native shell (`ios/App/App/AppDelegate.swift`, `ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift`)
- Java/Kotlin (Android skeleton) — Capacitor-generated Android wrapper under `android/`
- Groovy (Gradle DSL) — `android/build.gradle`, `android/app/build.gradle`, `android/variables.gradle`
- JavaScript (ESM config files) — `postcss.config.js`, `tailwind.config.js`

## Runtime

**Web Bundle Environment:**
- Browser (ES2020 target, DOM + DOM.Iterable libs per `tsconfig.json`)
- Capacitor WebView runtime on iOS/Android (web bundle from `dist/` packaged inside the native shell via `capacitor.config.ts` `webDir: 'dist'`)

**Build Toolchain:**
- Node.js (`"node": latest` in `codemagic.yaml`)
- npm with `package-lock.json` (locked via `npm ci` in CI)

**Native Runtime:**
- iOS — Capacitor 8 on APNs production environment (`ios/App/App/App.entitlements` `aps-environment = production`)
- Android — Capacitor 8 on Android SDK `compileSdk 36`, `minSdk 24`, `targetSdk 36` (`android/variables.gradle`)
- Android Gradle Plugin 8.13.0; google-services plugin 4.4.4 (`android/build.gradle`)
- Java 21 required for Android builds (`codemagic.yaml: java: 21`)

**Package Manager:**
- npm
- Lockfile: present (`package-lock.json`) — `npm ci` used in Codemagic workflows

## Frameworks

**Core:**
- React 18.2 (`react`, `react-dom`) — UI framework, function-component + hooks idiom
- React Router DOM 6.22.1 — HashRouter (deep links use `#/...`, see `src/lib/push.ts` `window.location.hash`)
- Capacitor 8.3 (`@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/cli`) — Native bridge
- Tailwind CSS 3.4 — Utility CSS, config in `tailwind.config.js` with custom `site` (slate) and `safety` (orange) palettes

**Backend / Data:**
- Supabase JS client 2.104+ (`@supabase/supabase-js`) — Postgres + Auth + Storage + Realtime, wrapped with a 15s fetch timeout in `src/lib/supabase.ts`

**Testing:**
- Playwright 1.59 (`@playwright/test`, `playwright`) — E2E (devDependency only, no config file at repo root)

**Build/Dev:**
- Vite 5.1 (`vite`, `@vitejs/plugin-react`) — Dev server + production build (`vite.config.ts`, `base: './'` for Capacitor `file://` compatibility)
- PostCSS 8.4 + autoprefixer 10.4 — `postcss.config.js`
- TypeScript compiler `tsc` runs before `vite build` (see `package.json` `"build": "tsc && vite build"`)

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` ^2.104.0 — Sole backend client (auth, data, storage, realtime)
- `@capacitor/push-notifications` ^8.0.3 — Captures APNs/FCM tokens; relays through `src/lib/push.ts`
- `@capacitor/splash-screen` ^8.0.1 — Splash config in `capacitor.config.ts`
- `@capacitor/status-bar` ^8.0.2 — Status bar style
- `react-router-dom` ^6.22.1 — Routing (HashRouter)
- `lucide-react` ^0.363.0 — Icon library

**Data/Export:**
- `xlsx` ^0.18.5 — Excel export (`src/lib/export.ts`)
- `jspdf` ^4.2.1 + `jspdf-autotable` ^5.0.7 — PDF export with tables
- `recharts` ^2.12.2 — Dashboard charts

**Build/Dev (devDependencies):**
- `vite-plugin-pwa` ^1.2.0 + `workbox-window` ^7.4.0 — Present in deps but currently NOT registered (see `src/main.tsx`: explicit SW cleanup of any v1 leftovers)

## Configuration

**Build Configuration Files:**
- `vite.config.ts` — Vite + React plugin; `base: './'` for Capacitor; dev server `host: 0.0.0.0:5173` with WSS HMR for tunnelling
- `tsconfig.json` — Strict TS, ES2020, bundler module resolution, JSX `react-jsx`, `noEmit: true`
- `tsconfig.node.json` — Referenced for Vite config typechecking
- `tailwind.config.js` — Custom theme (Inter/Poppins fonts, site/safety palettes, custom shadows/radii)
- `postcss.config.js` — Tailwind + autoprefixer
- `capacitor.config.ts` — appId `com.kwanchunkit.constructionapp`, appName `CK Construction`, webDir `dist`, splash + status-bar plugin config

**Environment Variables (consumed via `import.meta.env`):**
- `VITE_SUPABASE_URL` — required, validated at module load in `src/lib/supabase.ts`
- `VITE_SUPABASE_ANON_KEY` — required, validated at module load in `src/lib/supabase.ts`
- (For CI builds, these are baked in via `codemagic.yaml` env vars per workflow.)

**iOS:**
- `ios/App/App/Info.plist` — Bundle metadata, usage strings (Camera/Photos/Microphone in zh-HK), `UIBackgroundModes: remote-notification`, portrait + landscape orientations
- `ios/App/App/App.entitlements` — `aps-environment = production`
- `ios/App/App/AppDelegate.swift` — Forwards APNs `didRegisterForRemoteNotifications` to Capacitor via `NotificationCenter` posts
- `ios/debug.xcconfig` — Debug build settings
- Team ID `C22JSRYW54` (in `codemagic.yaml`)

**Android:**
- `android/app/build.gradle` — Application module; conditionally applies `com.google.gms.google-services` plugin if `google-services.json` exists
- `android/app/google-services.json` — Firebase config for FCM (present in repo)
- `android/variables.gradle` — SDK versions and AndroidX dependency versions
- `android/build.gradle` — Top-level; AGP 8.13.0, google-services 4.4.4

**App icons / metadata:**
- `index.html` — Lang `zh-HK`, theme color `#1d4ed8`, Apple PWA meta, Inter+Poppins from Google Fonts
- `docs/app-store-metadata.md`, `docs/screenshots-guide.md`

## Platform Requirements

**Development:**
- Node (`latest` per CI) + npm
- Vite dev server runs on port 5173 (`vite.config.ts`)
- For native dev: macOS + Xcode (iOS), Android Studio + JDK 21 (Android)
- Helper scripts at repo root: `kill-port.ps1`, `open-tunnel.ps1` (Windows PowerShell)

**Production / Deployment:**
- **iOS App Store** — Live build, distributed via TestFlight + App Store (see Codemagic workflows `ios-app-store`, `ios-testflight`)
- **Android Internal Test** — Debug-signed APK + AAB for sideload / Internal App Sharing (workflow `android-internal-test`; pending Play developer identity verification)
- **CI/CD** — Codemagic `mac_mini_m2` instance type (free tier) for all three workflows
- **Backend** — Supabase managed instance at `https://syyntodkvexkbpjrskjj.supabase.co`

## Project Scripts (`package.json`)

```
npm run dev       # vite dev server
npm run build     # tsc && vite build (produces dist/)
npm run preview   # vite preview
npm run cap:sync  # build + npx cap sync ios
npm run cap:open  # npx cap open ios
```

---

*Stack analysis: 2026-05-11*
