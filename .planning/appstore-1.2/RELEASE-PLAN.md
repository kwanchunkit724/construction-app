# RELEASE-PLAN.md — CK工程 v1.2 iOS App Store

App: CK工程 / Construction App · Bundle `com.kwanchunkit.constructionapp` · Team `C22JSRYW54`
Update from live 1.1 → 1.2 · UI language zh-HK.

**readyToSubmit: NO** — code/CI are submission-ready, but two privacy items (stale Privacy Policy + App Privacy labels) are hard gates that must be fixed first. All version/signing/export-compliance checks pass.

**submit_to_app_store flag: KEEP `false` (manual submit).** This is an established live app; the human wants to control the What's New copy and use phased rollout, both done in App Store Connect after the build lands. The CI correctly does `submit_to_testflight: true` / `submit_to_app_store: false`. Do NOT flip it.

---

## 1. Final What's New (新功能)

### zh-HK (paste into App Store Connect)
今次更新（1.2）令日常用更順手：

進度表更易睇
• 每行更精簡，一個畫面睇到更多項目，唔使成日碌
• 一撳「更新」即改進度，其他功能收入「⋯」選單，畫面更清爽
• 修正手機上標題列遮住列表、選單被切到等問題

匯出報告升級
• 一鍵分業主版同內部版：業主版係一頁紙，大字重點、各區進度條一眼睇晒；內部版再附詳細分區清單
• 新增「本期」變化，清楚顯示今期比上期進度郁咗幾多（綠色升、紅色跌），唔再淨係一張靜態快照
• 報告開頭一句白話總結（例如「整體 6% · 超前 6%」），透過 WhatsApp 分享時對方即刻睇得明
• 修正 PDF 分頁切爛文字／表格行嘅問題，檔案更細更快

工地指令、變更指令、工作許可證
• 修正載入問題：指令標題、變更項目同許可證簽核清單而家全部正常顯示

多謝各位判頭、工地主任嘅意見，我哋會繼續改進。

### English (secondary locale, if listed)
What's new in 1.2 — smoother day-to-day use:

Easier-to-read progress table
• Tighter rows so you see more items per screen with less scrolling
• One-tap Update on each item; everything else tucked into a "⋯" menu for a cleaner view
• Fixed the sticky header covering the list and the menu getting clipped on phones

Upgraded report export
• Split into an Owner one-pager and an Internal detailed version: the owner view fits on a single page with big headline numbers and a progress bar per zone; the internal view adds a full per-zone breakdown
• New "this period" change shows how much progress moved since last time (green up, red down) — a progress report, not just a static snapshot
• A plain-language summary line leads the report (e.g. "Overall 6% · 6% ahead") so it reads clearly when shared over WhatsApp
• Fixed PDF page breaks slicing through text and table rows; smaller, faster files

Site Instructions, Variation Orders & Permits to Work
• Fixed a loading issue — instruction titles, variation line items, and permit sign-off checklists now all display correctly

Thanks to the foremen and site agents for your feedback. More improvements to come.

Scope note: marketing pages (/sell /takeaway /mission), backend realtime/perf work, snapshot table, and offline read-only mode are intentionally excluded from user-facing notes — they are infra or web-only and not the three headline benefits a 判頭/工地主任 notices.

---

## 2. Metadata gaps + fixes

### BLOCKING (fix before submit)
| Item | State | Fix |
|---|---|---|
| Privacy Policy content | STALE — contradicts app | `public/privacy-policy.html` says "no GPS, no audio, photos only for issues". App now collects location (SI geo-tag), audio (SI voice memo), signatures, and drawings/PTW/daily-log photos. Rewrite sections 1.2/1.3/2; re-deploy so the live Vercel URL reflects it. **[repo edit + deploy]** |
| App Privacy labels — Location | MISSING | Add "Coarse Location" → Linked to User: Yes, Tracking: No, Purpose: App Functionality. **[console]** |
| App Privacy labels — Audio | MISSING | Add "Audio Data" (or confirm User Content) for the voice recorder. **[console]** |
| What's New 1.2 | MISSING | Paste copy from §1. Required field. **[console]** |
| Review Notes — new permissions | STALE | Add: location = SI site-location tagging; microphone = SI voice memos; camera/photos now also used in drawings/PTW/daily logs. **[console]** |
| Demo account | UNKNOWN | Verify 91234567 / admin1234 logs into live Supabase and reaches SI/VO/PTW. **[human verify]** |

### NON-BLOCKING (editable anytime; quick conversion wins)
| Item | State | Fix |
|---|---|---|
| Description (zh + en) | STALE — v1.0 feature set | Rewrite to cover 圖則, SI 工地指令, VO 變更指令 (HKD), PTW 工作許可證, 每日日誌, 物料, 通訊錄, 行事曆, report export, version management. |
| Keywords | STALE | Within 100 chars add: 工地指令, 變更指令, 工作許可證, 圖則, 每日日誌, 安全, permit, drawings; drop weak generic terms. |
| Promotional Text | STALE — prior release pitch | Lead with 1.2: 進度表 redesign, owner one-pager report v2, SI/VO/PTW fix. No Apple review needed. |
| Screenshots — 進度表 | STALE | Recapture screenshot #3 on the 1.2 build (iPhone 6.7" 1290×2796) — table was redesigned. Not required for approval but mismatch hurts conversion. |
| Screenshots — new features | MISSING | Optionally add SI/VO/PTW, daily log, drawings, report export shots. |
| Camera/Photo usage strings | OK but narrow | Strings still say "現場問題照片"; acceptable, but broadening + matching Review Notes avoids reviewer surprise at prompts in drawings/PTW. |
| codemagic.yaml comment | COSMETIC | Lines 54–56 & ~182 say "Derive monotonic 1.0.<BUILD_NUMBER>" but code hard-codes "1.2". Clean up when convenient; no functional impact. **[repo]** |

---

## 3. Readiness checklist (verified against repo)
| Check | Pass | Evidence |
|---|---|---|
| Marketing version > live 1.1 | ✅ | codemagic.yaml:57 `agvtool new-marketing-version "1.2"`; package.json 1.2.0 |
| Build number monotonic | ✅ | codemagic.yaml:53 `agvtool new-version -all "$(date +%s)"` (epoch, strictly increasing) |
| Account-deletion compliance intact | ✅ | Profile.tsx `delete_my_account` + v6-account-deletion.sql; no auth changes in 1.2 |
| Export compliance key set | ✅ | Info.plist:71-72 `ITSAppUsesNonExemptEncryption = false` |
| Usage strings present + zh-HK | ✅ | Info.plist:50-59 Camera/Photo/PhotoAdd/Microphone/Location all zh-HK |
| No debug artifacts user-facing | ✅ | No server/cleartext block in capacitor.config; Release archive; /sell etc. native-gated |
| UIBackgroundModes for push | ✅ | Info.plist:60-63 `remote-notification`; aps-environment=production |
| Fresh JS bundle (no stale dist) | ✅ | Workflow purges dist/ + ios public/, rebuilds, verifies index hash, fails on mismatch |
| submit flag matches intent | ✅ | codemagic.yaml:118-119 testflight true / app_store false |
| Privacy Policy matches app | ❌ | Stale — see blockers |
| App Privacy labels match app | ❌ | Missing Location + Audio — see blockers |

---

## 4. Export compliance answer
**Answer: NO** — the app does not use non-exempt encryption. `ITSAppUsesNonExemptEncryption = false` is hard-coded in Info.plist (lines 71-72). The app relies only on Apple's standard HTTPS/TLS (NSURLSession, WebKit) and OS-provided crypto; no proprietary or third-party encryption is bundled (PTW token signing uses standard crypto). Qualifies for the standard exemption — no CCATS / year-end self-classification needed. Because the key is in Info.plist, App Store Connect will NOT re-prompt this on upload. No human action required.

---

## 5. Runbook (numbered, ordered)

**Phase A — Fix blockers (do first)**
1. **[AGENT/repo]** Rewrite `public/privacy-policy.html` sections 1.2, 1.3, 2 to disclose: location (SI site tagging), audio (voice memos), signatures, and the broader photo/drawing/PTW/daily-log/document collection. Bump the "last updated" date.
2. **[AGENT/repo]** Update the App Privacy table in `docs/app-store-metadata.md`: add Coarse Location (Linked: Yes / Tracking: No / App Functionality) and Audio Data; update Review Notes and Description/Keywords/Promo per §2.
3. **[AGENT/repo]** (Optional cosmetic) Fix the stale "1.0.<BUILD_NUMBER>" comments in codemagic.yaml.
4. **[HUMAN click]** Commit + push 1–3 to `main`. **Heads-up:** pushing to main auto-triggers `ios-testflight`, which also stamps 1.2 and uploads a TestFlight build — harmless (different build number) but you'll see an extra 1.2 build to disambiguate later. To avoid confusion, optionally disable the `ios-testflight` auto-trigger during this release.
5. **[HUMAN verify]** Confirm the Vercel deploy of the updated privacy policy is publicly reachable at construction-app-lime-six.vercel.app.
6. **[HUMAN login + verify]** Log into live Supabase / the app as demo admin 91234567 / admin1234; confirm it works and SI/VO/PTW screens load.

**Phase B — Build & upload (CI)**
7. **[HUMAN verify]** In Codemagic, confirm the `app_store_credentials` env group still holds valid APP_STORE_CONNECT_PRIVATE_KEY, APP_STORE_CONNECT_KEY_IDENTIFIER, APP_STORE_CONNECT_ISSUER_ID, CERTIFICATE_PRIVATE_KEY.
8. **[HUMAN login]** Log in to https://codemagic.io (account + MFA).
9. **[HUMAN click]** Open the app (construction-app), click **Start new build** → Branch = `main`, Workflow = **"iOS App Store Release"** (`ios-app-store`, NOT the TestFlight quick-build). Start build (runs on mac_mini_m2, ≤60 min).
10. **[CI/automatic]** Pipeline: `npm ci` → build → bundle-size check → purge+rebuild → cap sync → verify packaged bundle hash → stamp version 1.2 + epoch build → fetch signing files → archive (Release) → export IPA → upload to App Store Connect with `submit_to_testflight: true`.
11. **[HUMAN wait]** Build lands in TestFlight after Apple processing (minutes to ~1 hr). Export compliance auto-passes (key=false). It does NOT appear on the public App Store automatically.

**Phase C — Submit for review (App Store Connect, manual)**
12. **[HUMAN login]** Log in to App Store Connect (Apple ID + MFA) → My Apps → CK Construction.
13. **[HUMAN click]** **Update App Privacy** → add Coarse Location + Audio Data per §2. (Must reflect the app before submission.)
14. **[HUMAN click]** Click **+ Version**, create version **1.2**.
15. **[HUMAN click]** Paste the zh-HK What's New from §1 (and English if listed). Update Promo Text / Keywords / Description per §2 (optional but recommended). Update Review Notes with the new-permission explanations.
16. **[HUMAN click]** Recapture/upload the 進度表 screenshot (#3) on the 1.2 build if updating screenshots (optional).
17. **[HUMAN click]** Under **Build**, click **+** and select the 1.2 build delivered from TestFlight (pick the right epoch build number if multiple 1.2 builds appear).
18. **[HUMAN click]** Confirm demo account fields (91234567 / admin1234) and that Support/Marketing/Privacy URLs resolve.
19. **[HUMAN click]** If prompted for export compliance, answer **No**.
20. **[HUMAN click]** (Recommended) Enable **Phased Release for Automatic Updates** (7-day staged rollout) to limit blast radius on live users.
21. **[HUMAN click]** Click **Add for Review** / **Submit for Review**. Done — Apple review begins; promotion to the live store stays under your control.

**Age rating:** 4+ remains correct (B2B, no objectionable content); only re-answer if Apple's 2025 questionnaire forces it.