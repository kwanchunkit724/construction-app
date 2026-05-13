# Capacitor 8 plugin compatibility check (Plan 02-01 Task 7)

Date: 2026-05-13T10:05:40Z

## Plugin name resolution

RESEARCH.md §3 referenced `@capacitor-community/voice-recorder`. That
package name is NOT in the npm registry (404). The actual published
plugin is `capacitor-voice-recorder` (unscoped, by tchvu3 / community).

Action: Plan 02-03 must reference `capacitor-voice-recorder` — NOT the
`@capacitor-community/` scope.

## capacitor-voice-recorder

```
$ npm view capacitor-voice-recorder peerDependencies
{ '@capacitor/core': '>=7.0.0' }
```

## @capacitor/geolocation

```
$ npm view @capacitor/geolocation peerDependencies
{ '@capacitor/core': '>=8.0.0' }
```

## Verdict

- **capacitor-voice-recorder: PASS** — peerDependency `@capacitor/core >=7.0.0`
  is satisfied by our `@capacitor/core ^8.3.x`. No fallback needed.
- **@capacitor/geolocation: PASS** — peerDependency `@capacitor/core >=8.0.0`
  is satisfied. No risk.

## Action for Plan 02-03

- Install `capacitor-voice-recorder@latest` (not the `@capacitor-community/`
  scope referenced in RESEARCH.md — that scope does not publish a
  voice-recorder package).
- Install `@capacitor/geolocation@latest` for SI location capture.
- No MediaRecorder fallback required for native voice; the plugin is
  Capacitor 8-compatible. (MediaRecorder is still the web-runtime path
  inside the same plugin's web shim.)
- Risk A1 (RESEARCH.md) downgraded to "resolved".
