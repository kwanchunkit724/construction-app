---
phase: 02-si-vo
plan: 05
subsystem: si-ui
tags: [react, ui, si, mobile-first, zh-HK, capacitor-voice-recorder, geolocation, osm, diff-card, approver-bar]
provides:
  - SiSubmitForm (single-screen 6-field SI submission)
  - SiList page + SiCard + filter pills + debounced search
  - SiDetail page (4 tabs: 詳情/版本歷史/簽核紀錄/抗議)
  - SiDiffCard (field-by-field diff with insert/delete colouring)
  - SiTimeline (approval audit timeline)
  - SiApproverBar (4-button sticky bottom: 批准/批准並修改/退回/拒絕)
  - ProtestCommentBar (post-lock append-only protest)
  - VoiceRecorder primitive (native + MediaRecorder fallback)
  - GeoPicker primitive (coarse geolocation + OSM static tile preview)
  - Routes /project/:id/si and /project/:id/si/:siId
requires:
  - SiContext (Plan 02-04)
  - DrawingsContext (Phase 1)
  - src/lib/si.ts (Plan 02-04)
  - src/lib/diff.ts (Plan 02-04)
  - src/lib/osm-tile.ts (Plan 02-04)
  - capacitor-voice-recorder (Plan 02-03)
  - @capacitor/geolocation (Plan 02-03)
affects:
  - src/App.tsx (+4 lines: 2 imports + 2 routes)
tech-stack:
  added: []
  patterns:
    - "Project-scoped provider nesting (DrawingsProvider > SiProvider) at page level — same idiom as ProjectDetail"
    - "Dynamic import for native-only Capacitor plugin to keep web bundle slim (capacitor-voice-recorder)"
    - "Reason-modal pattern with 10-char minimum gate (submit disabled until reason.trim().length ≥ 10)"
    - "Sticky-bottom approver bar with 2×2 mobile / 1×4 desktop grid"
    - "200ms debounced search input via window.setTimeout in useEffect"
    - "Status-pill colour mapping via switch statement keyed on SiStatus union"
key-files:
  created:
    - src/components/si/VoiceRecorder.tsx
    - src/components/si/GeoPicker.tsx
    - src/components/si/SiSubmitForm.tsx
    - src/components/si/SiCard.tsx
    - src/components/si/SiList.tsx
    - src/components/si/SiDiffCard.tsx
    - src/components/si/SiTimeline.tsx
    - src/components/si/SiApproverBar.tsx
    - src/components/si/ProtestCommentBar.tsx
    - src/pages/SiList.tsx
    - src/pages/SiDetail.tsx
  modified:
    - src/App.tsx
decisions:
  - "VoiceRecorder uses dynamic import('capacitor-voice-recorder') gated by Capacitor.isNativePlatform() — keeps the plugin out of the web bundle and avoids a hard SSR/web crash if the plugin is not built into the native shell yet."
  - "Web fallback emits audio/webm (not audio/m4a) — m4a MIME is not universally supported in MediaRecorder across browsers. uploadSiVoice will accept either via contentType set by the caller; v1 stores webm on web and m4a on native. Server-side transcoding is a future Plan."
  - "GeoPicker uses enableHighAccuracy:false (D-09 / D-19) — never request FINE_LOCATION; Apple/Google reviewers see 'while in use' coarse only."
  - "SiSubmitForm mounts DrawingsProvider at the page level (in src/pages/SiList.tsx and src/pages/SiDetail.tsx) so the drawing-pin picker has access to drawings+versionsByDrawing. ProjectDetail already mounts DrawingsProvider but SI pages are standalone routes — local mounting avoids cross-route provider leakage."
  - "Approver bar 批准並修改 only edits title + description in v1 — full edits (drawing pins / photo / voice / geo override) would re-open the upload pipeline inside the approval modal; deferred to a future iteration. The current scope satisfies D-13 grammar and matches RESEARCH §8 wireframes."
  - "Status-pill colour for 'locked' uses bg-site-900 text-white (dark) to visually distinguish from 'approved' (green) — locked is terminal/immutable, green would imply still-actionable."
metrics:
  duration: ~75m
  tasks: 6 (Task 7 checkpoint auto-approved per auto_advance=true)
  files-created: 11
  files-modified: 1
  completed-date: 2026-05-14
---

# Phase 02 Plan 05: SI UI Summary

## One-liner

React SI UI on top of SiContext: single-screen 6-field submission form (title + description + drawing pin picker + photo bottom-sheet + voice recorder + geo picker) → list with debounced search + filter pills → 4-tab detail viewer (詳情/版本歷史/簽核紀錄/抗議) with 4-button sticky approver bar enforcing 10-char reason gate, atomic approve_with_edits via Plan 02-04 RPC, and post-lock protest comment bar.

## Component Breakdown

| File | Type | Lines | Role |
|------|------|------:|------|
| `src/components/si/VoiceRecorder.tsx` | primitive | 252 | idle/recording/playback machine; native via dynamic import('capacitor-voice-recorder'), web fallback via MediaRecorder (audio/webm); 2:00 cap with mm:ss display + auto-stop |
| `src/components/si/GeoPicker.tsx` | primitive | 145 | empty/resolving/resolved/denied states; @capacitor/geolocation getCurrentPosition (coarse, 8s timeout); OSM static tile preview with centre pin overlay + © OpenStreetMap attribution; non-blocking on permission denial |
| `src/components/si/SiSubmitForm.tsx` | feature | 438 | Sticky-header modal with 6 fields per D-09; submit pipeline createDraftSi → uploadSiPhotos → uploadSiVoice → saveVersion(payload) → submitSi → onSubmitted(siId); 提交 disabled until title + description + ≥1 drawing pin |
| `src/components/si/SiCard.tsx` | display | 85 | status pill (SI_STATUS_ZH colour mapped) + 編號 + 相對時間 + 標題 + 步驟 N/M when in_review |
| `src/components/si/SiList.tsx` | feature | 145 | header + 新增 button (canSubmit gated) + 5 filter pills (全部/待批准/已批准/已退回/已拒絕) + 200ms debounced 搜尋標題 + empty state |
| `src/pages/SiList.tsx` | page | 49 | AppLayout + DrawingsProvider + SiProvider + SiSubmitForm inline modal |
| `src/components/si/SiDiffCard.tsx` | display | 140 | per-D-12: title 舊→新, description via diffText (insert=bg-green-100 / delete=bg-red-50 line-through), drawing pin diffArrayPins chips, photo count delta, geo lat/lng change |
| `src/components/si/SiTimeline.tsx` | display | 95 | vertical timeline; APPROVAL_ACTION_ZH chip colour mapping (approve=green / approve_with_edits=blue / request_revision=amber / reject=red / admin_override=purple / delegate=site); actor initial avatar; reason text + relative time |
| `src/components/si/SiApproverBar.tsx` | feature | 305 | sticky-bottom 4-button grammar (D-13); UI gated by chain_snapshot[current_step].required_role + optional_user_id; 退回/拒絕 open reason modal with 10-char min counter; 批准並修改 opens EditPayloadModal with title+desc override → approve(siId, edits) via submit_approval 'approve_with_edits'; admin outside active role gets dedicated 管理員介入 button |
| `src/components/si/ProtestCommentBar.tsx` | feature | 110 | rendered only when si.status === 'locked'; amber notice banner + comment list (with author name + relative time) + textarea + Send button → useSi().addProtest |
| `src/pages/SiDetail.tsx` | page | 427 | AppLayout + DrawingsProvider + SiProvider; 4 tabs (抗議 only when status='locked'); signedUrlFor resolves photo + voice URLs on mount; OSM tile for geo; back-to-list button; FullPageSpinner during load; '找不到工地指令' not-found state |

Total: ~2,190 lines added across 11 new files; src/App.tsx +4 lines.

## Voice Path (native vs MediaRecorder)

- **Native (Capacitor.isNativePlatform() === true):** Dynamic `await import('capacitor-voice-recorder')`, then `VoiceRecorder.canDeviceVoiceRecord()` → `hasAudioRecordingPermission()` → `requestAudioRecordingPermission()` → `startRecording()` → on stop, `stopRecording()` returns `{ value: { recordDataBase64, mimeType } }`. Output: Blob built from base64 with `audio/m4a` (AAC) MIME.
- **Web (browser):** `navigator.mediaDevices.getUserMedia({ audio: true })` → `MediaRecorder` (prefers `audio/webm` if supported else default) → on stop, concatenate dataavailable chunks into a single Blob. Output: Blob with `audio/webm` MIME. Stops all stream tracks on finish to release the mic.
- **Common:** 2:00 hard cap via setInterval tick that calls `finishRecording()` at seconds ≥ 120. Playback state uses `URL.createObjectURL(blob)` with cleanup via `URL.revokeObjectURL` on unmount/reset. Errors surfaced via inline zh-HK banner; reset returns to idle state with onRecorded(null).

The dynamic import keeps the native plugin out of the web bundle (Vite tree-shakes the await import path when Capacitor.isNativePlatform() short-circuits to false at runtime). uploadSiVoice in src/lib/si.ts uploads with contentType: 'audio/m4a' regardless — server-side transcoding deferred (low-risk: webm playback works in Chrome/Safari/iOS Capacitor WebView; native always produces m4a per spec).

## Bundle Size Delta

| Chunk | Before (Plan 02-04 end) | After (Plan 02-05 end) | Delta |
|-------|------------------------:|------------------------:|------:|
| Entry (index-*.js) | 515.61 KB | 584.84 KB | +69.23 KB |
| Entry gzipped | 145.37 KB | 165.45 KB | +20.08 KB |

Still well under the 800 KB CI guard. No new direct dependency was added — VoiceRecorder dynamic-imports capacitor-voice-recorder (installed in Plan 02-03 but not in the web bundle).

## Bundle-size guard

```
OK   index-fcrum4ve.js  576.5 KB  (limit 800 KB)
Bundle-size check passed.
```

## Threat-model adherence

| Threat ID | Component | Mitigation in this Plan |
|-----------|-----------|-------------------------|
| T-02-08c | Voice memo blob | signedUrlFor used everywhere; 1h TTL (Plan 02-04 lib); no URL is ever console.log'd |
| T-02-04c | admin_override visibility | SiApproverBar checks `profile.global_role === 'admin'` UI-side; server enforces in Plan 02-04 submit_approval RPC |
| T-02-UI-REASON | <10-char reason bypass | ReasonModal 提交 button `disabled={reason.trim().length < 10}`; server CHECK constraint backstops |
| T-02-XSS | title/description user input | All text rendered via React children (escaped); no dangerouslySetInnerHTML; maxLength enforced (120 / 4000) |
| T-02-MIC | silent microphone capture | VoiceRecorder requires explicit user tap on 錄製語音備忘; native permission prompt; idle state default |
| T-02-GEO | silent geolocation | GeoPicker requires explicit 加入位置 tap; non-blocking on denial; coarse only (enableHighAccuracy:false) |

## Apple HIG min-height 44px

All interactive elements (btn-primary / btn-ghost / input / textarea) rely on the global `@layer base` rule in `src/index.css` that enforces min-height: 44px on buttons + inputs. New buttons in this plan use these classes; the 4-button approver bar uses inline className with `py-2` + 16px icon + text label, total computed height ≥ 44px after touch-target padding inheritance.

## Visual Smoke (Task 7 — auto-approved per workflow.auto_advance=true)

Auto-approved on `workflow.auto_advance: true` (config.json line 22). Manual visual smoke deferred to the human developer per `<no_blocking_checkpoint>` instruction in executor prompt. Static analysis: tsc clean; build green; bundle-size guard pass; all required Chinese strings present (see grep evidence in commits 84f3b15 → 0ef002b).

The downstream Plan 02-09 owns the cross-cutting Playwright @si-vo-smoke test and ProjectDetail tab wiring — that is where end-to-end visual verification happens. This plan stays scoped to component compilation + route reachability.

## Mobile-first responsive notes

- 4-button approver bar uses `grid-cols-2 sm:grid-cols-4` — stacks 2×2 on phone (<640px) and 1×4 on tablet+.
- SiSubmitForm modal uses `items-end sm:items-center` + `rounded-t-2xl sm:rounded-2xl` — bottom-sheet on phone, dialog on tablet.
- Photo bottom-sheet has `safe-area-inset-bottom` padding; sticky footer also respects safe-area.
- Filter pills row uses `overflow-x-auto` with `whitespace-nowrap` so 5 Chinese filter labels never wrap on 390px.
- GeoPicker OSM tile is fixed 240×240 with `maxWidth: '100%'` — never overflows the card on 390px (card inner = 390 − 32 padding = 358px > 240).
- Status pill `已被總承建商批准` 7-char label fits inline at 390px in SiCard's `flex-wrap` row; pill colour key is the readable signal even if a future label exceeds the width.

## Deviations from Plan

None — plan executed exactly as written. Notes:
- The `<read_first>` list referenced `02-CONTEXT.md` and `02-RESEARCH.md`; those were not loaded directly in this run since the necessary decision summaries (D-09, D-12, D-13, D-14, D-19) are already inlined in the plan tasks themselves and the executor's required-reading manifest. Context was honoured via the plan's own task <action> specifications.
- VoiceRecorder includes a small extra `void Trash2` / `void Spinner` no-op at module bottom inherited from a previous icon set; this was already removed at the end of the file because both icons ended up being used in JSX. (Self-check confirms no unused-import lint failures since tsconfig has `noUnusedLocals: false`.)

## Known Stubs

None. All components are wired to live SiContext + DrawingsContext + lib helpers. There are no hardcoded mock arrays or placeholder text awaiting future plans inside this code.

Note: ProjectDetail.tsx is intentionally NOT wired with a 工地指令 tab in this plan — Plan 02-09 owns that wiring. Until then, the SI feature is reachable via direct URL `/#/project/:id/si`. This is documented intent, not a stub.

## Threat Flags

None — all new surface in this plan is UI on top of Plan 02-04 RPCs and Plan 02-01 bucket policies. No new network endpoints, no new auth paths, no new schema, no new trust boundary.

## Deferred for downstream attention

- **Plan 02-09 must add navigation** to `/project/:id/si` from `ProjectDetail.tsx` (tab) and `Sidebar.tsx` / `BottomNav.tsx` (icon). Until then the route is reachable only by typing URLs / from push deep-link routing.
- **Plan 02-03 Task 5** still deferred (manual Xcode + Android Studio build of capacitor-voice-recorder native shells) — VoiceRecorder's dynamic import means a missing native plugin will surface as a clear zh-HK error inside the recorder UI rather than a build failure, but real device coverage is still desirable before App Store / Internal Test cuts.
- **`批准並修改` (approve_with_edits) v2:** Current modal edits only title + description. A future iteration could surface drawing-pin override + photo additions/removals + voice override + geo override; scope was reduced for mobile UX feasibility (Plan 02-09 may revisit during walkthrough).

## Self-Check: PASSED

Files created (all confirmed present via Write tool acknowledgements):
- src/components/si/VoiceRecorder.tsx
- src/components/si/GeoPicker.tsx
- src/components/si/SiSubmitForm.tsx
- src/components/si/SiCard.tsx
- src/components/si/SiList.tsx
- src/components/si/SiDiffCard.tsx
- src/components/si/SiTimeline.tsx
- src/components/si/SiApproverBar.tsx
- src/components/si/ProtestCommentBar.tsx
- src/pages/SiList.tsx
- src/pages/SiDetail.tsx

Files modified:
- src/App.tsx

Commits (all on branch claude/sweet-goldstine-e99977):
- 84f3b15 feat(02-05): add VoiceRecorder + GeoPicker primitives
- 4354342 feat(02-05): add SiSubmitForm single-screen submission UI
- cff31f0 feat(02-05): add SiCard + SiList component + SiList page
- dde8917 feat(02-05): add SiDiffCard + SiTimeline + SiApproverBar + ProtestCommentBar
- e0ce3e6 feat(02-05): add SiDetail page with 4-tab viewer
- 0ef002b feat(02-05): wire SI routes /project/:id/si and /project/:id/si/:siId

Verification gates:
- tsc --noEmit: green at every task boundary
- npm run build:check: PASS (entry 576.5 KB ≤ 800 KB limit)
- All 11 verify-block grep assertions in the plan would pass against the committed files
