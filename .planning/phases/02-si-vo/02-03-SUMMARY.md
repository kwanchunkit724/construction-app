---
phase: 02-si-vo
plan: 03
subsystem: native-plugins
tags: [capacitor, geolocation, voice-recorder, diff-match-patch, permissions]
requires:
  - "@capacitor/core ^8.3.x"
  - "v9-split/CAPACITOR8-COMPAT.md verdict (PASS/PASS)"
provides:
  - "@capacitor/geolocation runtime (SI D-09 location capture)"
  - "capacitor-voice-recorder runtime (SI D-09 voice memo)"
  - "diff-match-patch runtime (SI version diff card, Plan 02-05)"
  - "zh-HK NSLocationWhenInUseUsageDescription + RECORD_AUDIO permission"
affects:
  - package.json
  - package-lock.json
  - ios/App/App/Info.plist
  - ios/App/CapApp-SPM/Package.swift
  - android/app/src/main/AndroidManifest.xml
  - android/app/capacitor.build.gradle
  - android/capacitor.settings.gradle
tech-stack:
  added:
    - "@capacitor/geolocation@8.2.0"
    - "capacitor-voice-recorder@7.0.6"
    - "diff-match-patch@1.0.5"
    - "@types/diff-match-patch@1.0.36"
  patterns:
    - "Native permission strings in zh-HK matching existing tone (camera/photos pattern)"
    - "COARSE-only location to reduce Play Store review scrutiny + match D-09"
key-files:
  modified:
    - package.json
    - package-lock.json
    - ios/App/App/Info.plist
    - ios/App/CapApp-SPM/Package.swift
    - android/app/src/main/AndroidManifest.xml
    - android/app/capacitor.build.gradle
    - android/capacitor.settings.gradle
decisions:
  - "Voice recorder = native plugin (capacitor-voice-recorder@7.0.6) — A1 risk resolved; no MediaRecorder fallback needed"
  - "Updated existing NSMicrophoneUsageDescription from generic video-capture copy to SI-specific voice-memo copy (Rule 1 alignment with new actual use case)"
  - "COARSE_LOCATION only on Android — D-09 specifies non-blocking ~3km accuracy; FINE not added"
  - "Manual Xcode/Android Studio build (Task 5 checkpoint) deferred — autonomous run; no developer machine available this session"
metrics:
  duration: "~5 min"
  completed: "2026-05-14T04:55:00Z"
  tasks_executed: "4 of 5 (Task 5 checkpoint deferred — see Deferred section)"
---

# Phase 02 Plan 03: Native Plugins + Permissions Summary

Installed three runtime dependencies (`@capacitor/geolocation`, `capacitor-voice-recorder`, `diff-match-patch`) plus TS types; added zh-HK permission strings to iOS Info.plist and Android Manifest; ran `npx cap sync` for both platforms; verified TS strict compile + Phase 1 bundle CI guard remain green.

## What Was Built

### Dependencies installed
- `@capacitor/geolocation@^8.2.0` — peer `@capacitor/core >=8.0.0` satisfied
- `capacitor-voice-recorder@^7.0.6` — peer `@capacitor/core >=7.0.0` satisfied
- `diff-match-patch@^1.0.5` + `@types/diff-match-patch@^1.0.36`

### Voice recorder verdict — **PASS** (no fallback)
Per `supabase/v9-split/CAPACITOR8-COMPAT.md`, `capacitor-voice-recorder` (unscoped, NOT `@capacitor-community/`) is Capacitor-8 compatible. The plugin's peer dep `@capacitor/core >=7.0.0` is satisfied by our `^8.3.x`. Risk A1 (RESEARCH.md §3) downgraded to **resolved**. No MediaRecorder web-only fallback required.

### iOS Info.plist
- Added `NSLocationWhenInUseUsageDescription` = `需要你嘅位置以便在工地指令上記錄施工地點`
- Replaced `NSMicrophoneUsageDescription` ("拍攝影片時可能需要錄音") with `需要使用麥克風以便為工地指令錄音備忘`. Old string was generic video-capture; new string is SI-specific voice-memo. Rule 1 alignment — accurately describes actual usage for Apple compliance.
- Reordered keys alphabetically. All existing keys preserved verbatim (CAPACITOR_DEBUG, CFBundle*, UIBackgroundModes, NSCameraUsageDescription, NSPhotoLibrary*).

### Android Manifest
- Added `android.permission.ACCESS_COARSE_LOCATION` + `android.permission.RECORD_AUDIO`
- **Did NOT add** `ACCESS_FINE_LOCATION` per D-09 + threat T-02-08b mitigation (COARSE ≈ 3km accuracy is sufficient for site capture; reduces Play Store review scrutiny)
- Preserved existing INTERNET, ACCESS_NETWORK_STATE, POST_NOTIFICATIONS, WAKE_LOCK, VIBRATE

### Cap sync output
Both `npx cap sync ios` and `npx cap sync android` completed without errors. Plugin registration confirmed:
```
[info] Found 7 Capacitor plugins for ios:
       @capacitor/camera@8.2.0
       @capacitor/filesystem@8.1.2
       @capacitor/geolocation@8.2.0
       @capacitor/push-notifications@8.0.3
       @capacitor/splash-screen@8.0.1
       @capacitor/status-bar@8.0.2
       capacitor-voice-recorder@7.0.6
```
(was 5 plugins, now 7).

### Build verification
- `npx tsc --noEmit` — clean (no type errors).
- `npm run build:check` — passed. Entry chunk `index-0OTzF4lh.js` = 507.6 KB (limit 800 KB). No regression from Phase 1's bundle-size CI guard.

## Peer Dependencies Observed
| Package | Peer | Observed |
|---------|------|----------|
| `@capacitor/geolocation@8.2.0` | `@capacitor/core` | `>=8.0.0` |
| `capacitor-voice-recorder@7.0.6` | `@capacitor/core` | `>=7.0.0` |
| `diff-match-patch@1.0.5` | (none) | n/a |

## Sync Warnings (non-blocking)
- `[warn] capacitor-voice-recorder does not have a Package.swift / Some installed packages are not compatable with SPM` — Capacitor still wrote the SPM `Package.swift` and registered the plugin. Plugin falls back to CocoaPods-style entry. Confirmed plugin appears in the "Found 7 plugins" list. Will need Xcode build verification (deferred — see below) to confirm linker resolves successfully.

## Commits
- `19f2347` — feat(02-03): install @capacitor/geolocation + capacitor-voice-recorder + diff-match-patch
- `4c5cd51` — feat(02-03): add zh-HK permission strings for geolocation + microphone
- `b105c3b` — chore(02-03): npx cap sync ios + android — register geolocation + voice-recorder
- `(this commit)` — docs(02-03): plan summary + STATE + ROADMAP

## Threat Model Coverage
- **T-02-08a (microphone misuse, I):** Permission gated by OS prompt with zh-HK explanatory string explaining construction-site use; recorded data will route to private `project-si-vo` bucket via signed URLs (wired in Plan 02-04).
- **T-02-08b (location leakage, I):** COARSE-only (~3km on Android, neighborhood-level on iOS) — D-09 accepts low accuracy; threat surface minimal.
- **T-02-DEP (supply-chain, T):** Lockfile pins exact versions; `diff-match-patch` is Google-published; `@capacitor/geolocation` is official Ionic; `capacitor-voice-recorder` community risk accepted.
- **T-02-APP (Apple/Play reviewer rejects, S):** zh-HK strings clearly describe construction-site use (matching existing camera/photos tone). COARSE not FINE for Android. Document for next App Store submission.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NSMicrophoneUsageDescription text mismatch**
- **Found during:** Task 2
- **Issue:** Existing Info.plist string was `拍攝影片時可能需要錄音` (video-capture context, from a prior feature). After this plan, microphone is used for SI voice memo, not video. Apple's review guideline requires usage strings accurately describe the actual use.
- **Fix:** Replaced with `需要使用麥克風以便為工地指令錄音備忘` per plan-specified string.
- **Files modified:** `ios/App/App/Info.plist`
- **Commit:** `4c5cd51`

### Deferred Items

**1. [Task 5 - Checkpoint] Manual Xcode + Android Studio build verification**
- **Reason:** Plan's Task 5 is a `checkpoint:human-verify` requiring developer machine (Xcode clean build, Android Studio Gradle sync). Per orchestrator's `<no_blocking_checkpoint>` directive, autonomous run does not introduce a checkpoint asking for user confirmation.
- **Status:** All automated checks (cap sync x2, tsc, bundle guard) PASS. Manual native-build verification is recommended before Plan 02-05 (SI UI) lands — developer should run:
  ```
  npx cap open ios    # Xcode → Clean Build Folder → Build
  npx cap open android # Android Studio → Sync Gradle
  ```
- **Risk if skipped:** The `capacitor-voice-recorder` SPM warning ("does not have a Package.swift") MIGHT surface as an Xcode linker error. If so, switch the iOS pod-install path or pin to a version that has SPM support. Capture as a follow-up if encountered during Plan 02-05's TestFlight build.

### Out-of-scope discoveries
- `npm audit` reports 12 vulnerabilities (6 moderate, 6 high) in transitive deps. NOT introduced by this plan. Logged to `.planning/phases/02-si-vo/deferred-items.md` (do not block).

## Self-Check: PASSED
- FOUND: package.json contains @capacitor/geolocation, capacitor-voice-recorder, diff-match-patch, @types/diff-match-patch
- FOUND: ios/App/App/Info.plist contains NSLocationWhenInUseUsageDescription + zh-HK strings
- FOUND: android/app/src/main/AndroidManifest.xml contains ACCESS_COARSE_LOCATION + RECORD_AUDIO; NOT ACCESS_FINE_LOCATION
- FOUND: commit 19f2347 (npm deps)
- FOUND: commit 4c5cd51 (permission strings)
- FOUND: commit b105c3b (cap sync)
- FOUND: tsc clean
- FOUND: bundle guard green (entry 507.6 KB < 800 KB limit)

## Downstream Unblocks
- **Plan 02-04** (SiContext + submit_approval RPC) — can import `diff-match-patch` for SI version diff utility.
- **Plan 02-05** (SI submission UI) — can import `@capacitor/geolocation` for location capture; `capacitor-voice-recorder` for voice memo. Permission prompts will display zh-HK strings.

## Requirements Satisfied
**SI-02** — native enablement (location + voice memo plugins + permissions) complete.
