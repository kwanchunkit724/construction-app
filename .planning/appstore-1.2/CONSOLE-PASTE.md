# App Store Connect — 1.2 提交：直接 copy-paste 嘅內容

> 我（repo 側）已搞掂:私隱政策重寫 + redeploy、metadata doc 更新、release notes、runbook。
> 以下係你喺 **App Store Connect** 要貼／改嘅嘢。你登入,我可以 Chrome drive。

---

## 1. What's New（「今次更新」）— 必填

**zh-HK（主要）** — 見 `whats-new-zh.txt`，重點:
- 進度表更易睇（精簡每行、一撳更新、修標題列遮擋）
- 匯出報告升級（業主一頁紙 / 內部詳細、本期變化、白話總結、修 PDF 切爛）
- 工地指令／變更指令／工作許可證 載入修復

**English** — 見 `whats-new-en.txt`。

---

## 2. App Privacy（隱私營養標籤）— ⚠ 必改，否則 reject

而家聲明「Location: Not Collected」,但 1.2 收 GPS（SI 標位）+ 語音。要改成:

**Data Collected 加:**
| 類別 | Linked to You | Tracking | 用途 |
|---|---|---|---|
| Coarse Location | Yes | No | App Functionality（SI 現場位置;單次,非背景） |
| Audio Data | Yes | No | App Functionality（SI 語音備忘） |
| Photos or Videos | Yes | No | App Functionality（問題/圖則/SI/PTW/日誌） |
| User Content | Yes | No | App Functionality（備註/圖則/簽名） |

**Tracking:** No（維持）。

---

## 3. App Review → Notes for Review — 改返(解釋新權限)

```
Permissions are user-initiated, per feature:
- Camera / Photos: attach photos when reporting issues, and when uploading
  drawings, Site Instructions, Permits to Work and daily logs.
- Location (when-in-use): requested ONLY when a user geo-tags a Site
  Instruction's on-site location. No background tracking.
- Microphone: ONLY to record an optional voice memo on a Site Instruction.
Push notifications alert users of issue / SI / VO / PTW assignments and
approval decisions — never for marketing.

Demo account (Sign-in Information): Phone 91234567 / Password admin1234 (Admin).
Privacy policy: https://construction-app-lime-six.vercel.app/privacy-policy.html
```

---

## 4. 提交方式 = MANUAL（建議）
- Codemagic config 唔郁（`submit_to_app_store: false`）。
- Build 經 `ios-app-store` workflow → 上 App Store Connect / TestFlight。
- 你喺 App Store Connect:選 1.2 build → 填 What's New → 開 Phased Release（7 日漸進）→ **Add for Review**。
- Export compliance:答 **No**（app 只用 HTTPS/TLS;Info.plist 已設 ITSAppUsesNonExemptEncryption=false,多數唔會問）。

---

## 5. 你要核對嘅（verification,我做唔到）
- [ ] **私隱政策已 redeploy** → 開 https://construction-app-lime-six.vercel.app/privacy-policy.html 睇到「2026年6月9日」+ 有 Location/Audio。
- [ ] Demo account 91234567/admin1234 喺 LIVE 仲登到入,睇到 SI/VO/PTW。
- [ ] Codemagic `app_store_credentials`（API key + 證書）未過期。

全部 ✅ 先觸發 Codemagic build。

---

## 提醒
- `ios-testflight` 每次 push main 都自動出一個 1.2 TestFlight build → App Store Connect 揀 build 時揀啱嗰個。
- 1.2 一旦 approved,下次要改 `1.2`→`1.3`（codemagic.yaml 兩個 iOS workflow + package.json,手動）。
