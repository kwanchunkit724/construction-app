# 認證升級 — 生物認證 + 密碼重輸 + SMS 後備 + 註冊 SMS 驗證

**Owner 決定 (2026-06-18):** SMS provider = **Twilio**;註冊強制 SMS = **flag-gated,新 build 先開**(`signup_sms_required` 預設 OFF,唔郁 live 1.4)。

## 目標

1. **L3 step-up 變易用** —— 用後備鏈代替「淨係 TOTP」:
   `生物認證 (native) → 密碼重輸 (web / 生物失敗) → SMS 6 位碼 (最後)`
2. **註冊時 SMS 驗手機** —— flag-gated,新 build 先強制。

兩者都喺 `step_up_enforced` / `signup_sms_required` flag 之後先生效;flag OFF 時 live 行為**零變化**。

## 架構重點(已驗證)

- **一個 server mint path 共用三因素。** `step_up_grants` (v52) 冇 client write policy → 只有 **service-role INSERT** 鑄到 grant(同 `verify-sign-password` 鑄 `sign_reauth_grants` 一模一樣)。所以:
  - **密碼重輸** → Edge Function 用 GoTrue 驗密碼 → service-role 插 grant。
  - **生物認證** → 裝置 biometric 解鎖**安全儲存嘅密碼** → 餵入同一個密碼 Edge Function。裝置證在場,server 仍驗真 secret。**唔使另起 server path。**
  - **SMS** → Edge Function 驗 OTP → service-role 插 grant。
- 原本 `mint_step_up_grant` (AAL2/TOTP) **唔郁** —— 新嘅係額外、較弱但易用嘅 mint path,肯裝 app 嘅照可用 TOTP。
- 生物認證**唔升 Supabase AAL2** → 唔行 `mint_step_up_grant`,行密碼 Edge Function。

## 已完成(本次 — 安全、可驗、flag OFF)

| 件 | 狀態 |
|---|---|
| **v83 DB foundation** | ✅ applied + verified。`app_config.signup_sms_required` (預設 false) + `get/set_signup_sms_required` + `phone_verifications` 表(service-role only,code 存 sha256 hash,RLS 0 policy)+ `prune_phone_verifications` |
| **`verify-stepup-password` Edge Function** | ✅ 寫好(**無需 Twilio**)。驗密碼 → service-role 插 `step_up_grants(action_class, +5min)`。**未 deploy**(見下) |
| **本 spec** | ✅ |

## 待做(分階段)

### Phase 1 — 生物 + 密碼(無需 Twilio)
- [ ] **Deploy** `verify-stepup-password`(`supabase functions deploy verify-stepup-password`,或 dashboard Functions 貼上)。Secret `SUPABASE_SERVICE_ROLE_KEY` 已有(verify-sign-password 用緊)。
- [ ] **Capacitor 生物插件** —— `npm i @aparajita/capacitor-biometric-auth`(或 `capacitor-native-biometric`)+ `npx cap sync` + **native rebuild**(task #21 一齊)。iOS `Info.plist` 加 `NSFaceIDUsageDescription`(zh-HK)。
- [ ] **安全儲存密碼** —— 生物解鎖嘅密碼存 Keychain/Keystore(`@capacitor/preferences` 唔夠安全;用 biometric-secured secure storage 插件)。首次密碼重輸成功後問「下次用 Face ID?」→ 存。
- [ ] **`StepUpContext` 改後備鏈** —— `requireStepUp(class)`:
  1. flag OFF → return true(現狀)
  2. warm grant → true
  3. 揀因素:`Capacitor.isNativePlatform()` && 有生物 && 有存密碼 → 生物 → 解鎖密碼 → `verify-stepup-password`
  4. 否則 → 密碼重輸 modal → `verify-stepup-password`
  5. 失敗/唔記得密碼 → 「用 SMS」掣(Phase 2)
- [ ] TOTP 路徑保留做進階選項(肯裝 app 嘅)。

### Phase 2 — SMS(等 **owner 開 Twilio**)

**Sender 決定:** 用 **`TWILIO_FROM`**(單一寄件人字串)取代 Messaging Service SID —— 少一步、Edge Function 直接 `From=TWILIO_FROM`。Dev = trial 號碼(只寄去已驗證手機);Prod HK = upgrade 後用 **alphanumeric Sender ID**(例 `CKGONG`,香港支援、唔使買號碼)。

- [ ] Edge Functions(Twilio,POST `https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`,Basic auth = SID:TOKEN,`From=TWILIO_FROM`):
  - `send-stepup-sms` —— 生成 6 位碼、sha256 存 `phone_verifications(purpose='step_up', user_id, action_class)`、Twilio 寄去用戶電話(+852)。
  - `verify-stepup-sms` —— 驗碼(查 hash + 未過期 + attempts<max)→ 標 consumed → service-role 插 `step_up_grants`。
  - `send-phone-otp` / `verify-phone-otp` —— 註冊用(`purpose='signup'`,冇 user_id)。
- [ ] **Signup 流程**(flag-gated)—— `get_signup_sms_required()` true 時:輸手機 → 寄 OTP → 驗 → 先 `AuthContext.signUp`。OFF 時行返現狀。
  - ⚠️ v1 客戶端強制(自訂 client 可繞過);日後可改用 Edge-Function signup 喺 server 強制。
- [ ] **Rate-limit / 防濫發** —— 每電話每 N 分鐘最多 X 次(查 `phone_verifications` created_at);Twilio cost guard。

### OWNER 必做(我做唔到 — 開戶 / 入密鑰係 owner action)
- [x] 開 **Twilio** 戶口(trial,US$13.45 credit)+ 攞 Account SID / Auth Token。 ✅ 2026-06-18
- [x] Supabase Edge Function secrets:`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` 已 set。 ✅ 2026-06-18
      ⚠️ Auth Token 曾喺 chat 貼過 → owner 應 **rotate** 後更新 secret。
- [ ] `TWILIO_FROM` secret —— 待 P2 砌 function 時決定:dev = trial 號碼;prod HK = upgrade + alphanumeric Sender ID。
- [ ] **Upgrade Twilio**(入數)—— prod 寄畀工人前必須(trial 只可寄去已驗證號碼)。
- [ ] flip flag(全部 client live 之後):`select set_signup_sms_required(true)` + `select set_step_up_enforced(true)` + `select set_sign_reauth_enforced(true)`。

## 風險 / 注意

- **改 live 主登入流程** —— 註冊 SMS 一定 flag-gated,1.5 上兩個 store + Twilio ready 先 flip。live 1.4 用戶冇喺 GoTrue 驗電話,唔好搞 retro 強制。
- **Apple 合規** —— 新 auth 流程要保 account-deletion 審查;SMS 係 MFA/註冊驗證,非新主登入方式,但 binary 變更要過 review。
- **保安強度** —— 生物=裝置+在場(非 server 密碼學證明,靠解鎖存儲密碼);SMS 比 TOTP 弱(SIM-swap),做最後後備合理。最強仍是 TOTP,保留。
- **成本** —— 每條 SMS 收費(註冊 + step-up 後備)。Rate-limit + 優先用生物/密碼(免費)。
- **存密碼喺裝置** —— 用 secure enclave / biometric-secured storage,非明文 Preferences。日後可升級做 passkey/WebAuthn(免存密碼)。

## 相關檔

- `supabase/v52-step-up-foundation.sql` · `v54-step-up-rollout-flag.sql` · `v60-sign-reauth.sql`(mint/flag pattern 來源)
- `supabase/functions/verify-sign-password/index.ts`(Edge Function 範本)
- `supabase/v83-auth-stepup-sms-foundation.sql`(本次 DB)
- `supabase/functions/verify-stepup-password/index.ts`(本次,Phase 1)
- `src/contexts/StepUpContext.tsx` · `src/contexts/SignReauthContext.tsx` · `src/pages/Signup.tsx`(待改)

## 對抗式 review 後 — 已修 (v86, c19365c) + 待修 (flip 前)

**已修 (review 21 confirmed 中嘅 HIGH + exploitable medium):**
- HIGH OTP 並行爆破 → `v86 verify_phone_code` 原子 RPC(row lock,attempts cap 守得住,code 一次性,grant 綁 server 端 user_id);兩個 verify edge fn 改用佢。
- HIGH StepUpContext re-entry double-settle → flowId guard(isCurrent/settleFlow)。
- MEDIUM send-phone-otp SMS-bombing → flag OFF 時直接 403 拒絕。

**待修 — flip 相關 flag 之前必做(而家 flag OFF,未 live,唔急但唔可漏):**
- **[flip signup_sms_required 前] #3 註冊 SMS 只係 client gate** —— 自訂 client 可繞過。要 server-enforce:`user_profiles` BEFORE INSERT trigger 喺 `signup_sms_required` ON 時要求該 phone 有近期 consumed signup verification(或改用 Edge-Function signup)。
- **[flip step_up_enforced 前] #6 verify-stepup-password 無 app-level lockout** —— 靠 GoTrue 內建 rate-limit;考慮加每帳戶 cooldown。
- **[prod SMS 規模化前] #4 send-phone-otp 全域/IP 限流 / CAPTCHA** —— 而家得 per-phone(3/10min)+ flag-off 拒絕;大規模前加全域限流或 CAPTCHA + Twilio spend cap。
- **[生物認證強化,可選] #13 BIOMETRY_ANY → BIOMETRY_CURRENT_SET** —— 令新增指紋/面容時令已存憑證失效(更強綁定)。
- 全部低危 cosmetic(#9 offerBiometricSave UI、#11 enroll Link、#12 cleanup delete)留待順手再執。
- 完整 review 輸出:`tasks/wphvys308.output`(31 raw / 21 confirmed)。
