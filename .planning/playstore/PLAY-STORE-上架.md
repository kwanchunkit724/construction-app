# Google Play 上架計劃 — CK工程 (com.kwanchunkit.constructionapp)

> iOS 已上架 (1.2 審查中, 1.3 building)。Android 而家只有 debug-signed AAB 做 Internal App Sharing。
> Google Play 帳戶卡喺 **pending identity verification** — 呢個係而家嘅 blocker,verify 之前乜都出唔到。

## 🚩 第一個決定(你做,而且係永久性):帳戶類型

| | **Organization(建議)** | Personal |
|---|---|---|
| 12 測試員 / 14 日封閉測試 gate | **豁免** ✅ | **必須** ❌ |
| 需要 D-U-N-S 號碼 | 要(HK 最多 ~30 工作天,免費) | 唔使 |
| Listing 顯示 | 公司名(專業) | 個人名 |
| 最快時間 | 已有 DUNS ≈ 2 週;要新 DUNS ≈ 5-7 週(多數係等 DUNS) | ≈ 3.5-4.5 週(+ 招募測試員,易斷) |

**建議:Organization。** CK工程 係真公司 + iOS 已上架,Org 直接跳過 14 日測試,只係要 DUNS。
**D-U-N-S 係長 pole — 今日就去 Dun & Bradstreet HK 申請(免費)。** 公司名/地址要同 Play Console 一模一樣。

## 你要做(legal / 錢 / 帳戶)
1. ☐ 決定 Org vs Personal(上面)。
2. ☐ (Org) 申請/確認 **D-U-N-S 號碼**(D&B HK,~30 工作天)。← 即刻做。
3. ☐ 備好證件:代表人政府身份證 + 商業登記/公司文件 + 公司網站 + 公司 email/電話。
4. ☐ 俾 **US$25 一次性**註冊費(Google Payments,Org 用 business profile)。
5. ☐ 完成 **identity verification**(submit 文件 + OTP)→ 等 Google「verified」email(幾粒鐘到幾日)。
6. ☐ 第一次 release 時確認 **Play App Signing** enrollment(Google 保管 signing key,你保管 upload key)。
7. ☐ 填 **Data Safety form** + **IARC content rating** + target audience(法律聲明,我可以草擬你確認)。
8. ☐ 俾私隱政策 URL(直接用 iOS 嗰條)。
9. ☐ **只限 Personal**:招募 15-20 個真 Google 帳戶測試員(staff/判頭/管工),開封閉測試 track。

## 我可以做(build / config / assets)
- ☐ 產生 production **upload keystore**(keytool RSA 2048 ~25yr)— **但個 secret 你保管**(password manager + offline 備份),我會俾你指令 + 教你 load 入 Codemagic。
- ☐ Wire Codemagic android signing(build.gradle 已接好 `CM_KEYSTORE_*` env vars)。
- ☐ versionCode 策略:用 CI monotonic 值(`-PversionCode`,同 iOS 一樣)。
- ☐ Build production **AAB**(targetSdk 36 ✓ 過 API-35 底線),signed with upload key。
- ☐ Listing assets:icon 512²、feature graphic 1024×500、phone + tablet 截圖。
- ☐ zh-HK listing 文案(app 名 ≤30、短述 ≤80、全述 ≤4000)。
- ☐ 草擬 Data Safety + content-rating 答案俾你確認。

## ⏱ 14 日 trigger(你問嗰個)
- **只有 Personal 帳戶先有呢個 gate。Org 完全冇。**
- 14 日鐘**唔係**開 track 就計 — 要 (a) 封閉測試版 approved + (b) **≥12 個測試員真係喺 Google Play 裝咗**(sideload 唔算)先開始計。
- 14 日要**連續不斷** — 任何一日跌穿 12 個就**重置**。對策:招 15-20 個 buffer。
- 夠 14 日**唔會自動解鎖** — 要自己入 Play Console → 「Apply for production access」→ 答一堆問題(測試員點用、feedback、預估安裝量…)→ Google 審 ≤7 日。
- **我幾時幫你 set 呢個 trigger**:等你揀咗 Personal + 真係開咗封閉測試(≥12 人裝咗)嗰日話我知,我即刻 schedule 一個 14 日後嘅提醒 + 幫你草擬 production-access 申請答案。**而家 set 冇意義**(帳戶未 verify、未開測試;Org 根本唔需要)。

## 之後出新版(更新流程)
- 第一次 production approved 之後,**永遠唔使再做封閉測試** — 14 日 gate 係一次性解鎖。
- 每次更新:bump versionCode(CI 自動)+ versionName(如 1.3→1.4)→ build AAB(同一 upload key + package)→ 上 **production track** → 寫 release notes → submit。
- **每個更新都會 re-review**(冇得 skip),但通常快過第一次:幾粒鐘到 1-3 日(最多 7)。出街前留 5-7 日 buffer。
- 用 **staged rollout**(5%→10%→50%→100%)減風險;出事 →「Halt」自動回上一版。
- iOS 完全唔受影響(分開 store / pipeline)。

## 最快路線總結
**今日**:決定 Org → 申請 DUNS(若未有)。DUNS 等緊嘅 ~30 日,我並行整好 keystore wiring + AAB + assets + listing(1-2 日,唔阻 critical path)。DUNS 到 → verify(幾日)→ 上 production → 審 ≤7 日 → 出街。
