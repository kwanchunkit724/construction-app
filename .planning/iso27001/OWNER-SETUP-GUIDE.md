# Owner Setup Guide — 帳戶 MFA + Supabase DPA + 備份證據
> 呢啲動作只有你（帳戶持有人 關進杰）做得到。Claude 唔會代你開 MFA / 簽協議 / 改帳戶設定（安全規則）。以下係逐步教學。
> 完成後喺 [13-certification-readiness-checklist.md](13-certification-readiness-checklist.md) 打剔 + 留截圖／PDF 作 ISO 審核證據。

---

## 0. ✅ 已自動確認（我幫你查咗）
- **Supabase 計劃 = Pro**（org「Echo」）。
- **每日備份 = 有行**：7 個 COMPLETED 實體備份 + WAL-G 已開。→ ISO **A.8.13 每日備份已達到**。
- **PITR（時間點還原）= 未開**（Pro 內可加，見第 4 節，可選）。

---

## 1. Supabase 帳戶 MFA（最重要，A.8.2 特權存取）
你個 Supabase 帳戶揸住成個後台 + service-role key，一定要 MFA。

1. 登入 https://supabase.com/dashboard
2. 右上角頭像 → **Account Preferences**（或 https://supabase.com/dashboard/account/security ）
3. 揀左邊 **Security** 分頁 → **Multi-Factor Authentication / Two-Factor Authentication**
4. 撳 **Add authenticator app / Enroll** → 用手機 authenticator app（Google Authenticator / Authy / 1Password / Microsoft Authenticator）掃 QR code
5. 入返 app 顯示嘅 6 位數驗證 → 確認
6. **儲起 recovery codes**（影相／印出，放安全地方）—— 跌手機時靠佢
7. ✅ 截圖「MFA enabled」作證據

---

## 2. Apple ID / App Store Connect MFA（A.8.2）
Apple 開發者帳戶**本身強制 2FA**，多數已開。確認一下：

1. 去 https://account.apple.com → 登入
2. **Sign-In and Security** → **Two-Factor Authentication** → 應該顯示 **On**
3. 確認有至少一個 **Trusted Phone Number**（跌裝置時收驗證碼）
4. ✅ 截圖作證據（多數已經係 On，verify 即可）

---

## 3. GitHub MFA（A.8.2 — 揸住 source code + CI）
1. https://github.com → 右上頭像 → **Settings**
2. 左邊 **Password and authentication**（Access 區）
3. **Two-factor authentication** → **Enable two-factor authentication**
4. 揀 **Authenticator app**（推薦）或 **Passkey** → 掃 QR → 入驗證碼
5. **儲起 recovery codes**
6. ✅ 截圖

---

## 4. Codemagic MFA（A.8.2 — 揸住 build / signing）
Codemagic 多數係用 **GitHub 登入**（OAuth），咁第 3 節嘅 GitHub MFA 已經覆蓋佢。如果你有獨立 Codemagic 密碼登入：

1. https://codemagic.io → **Account settings**（左下頭像）
2. **Security / Authentication** → 開 **Two-factor authentication**（TOTP）
3. ✅ 截圖。如果淨係 GitHub 登入 → 喺文件寫「Codemagic access via GitHub SSO, covered by GitHub MFA」即可。

---

## 5. 簽 Supabase DPA（資料處理協議，A.5.23 — 法律必需）
DPA = Supabase 以「資料處理者」身分處理你用戶 PII 嘅合約。ISO 審核 + PDPO 都要。

**方法（Supabase 自助 DPA）：**
1. 去 https://supabase.com/legal/dpa
2. 通常有一個 **「Sign DPA / Request DPA」** 表格或 click-to-accept。填：
   - 公司名／個人名：**關進杰**（你係個人開發者，填你全名）
   - Email：kck980724@gmail.com
3. 提交 → 收返已簽 PDF（或喺 Dashboard → **Organization Settings → Legal / Compliance Documents** 下載）
4. **下載個 PDF 留底**，放入 ISMS 證據夾，更新 [05-supplier-and-cloud-register.md](05-supplier-and-cloud-register.md) 嘅 DPA 狀態為「Signed YYYY-MM-DD」
5. （如果網頁搵唔到自助 DPA：email security@supabase.com 或 support 要求 DPA）

> ⚠️ 簽協議係你嘅動作（接受法律條款）。我唔會代簽。

---

## 6. （可選）開 PITR + 做一次 Test Restore（A.8.13 / A.5.30）
**PITR（可選，更幼 RPO）：** Dashboard → 你個 project → **Database → Backups → Point-in-Time Recovery** → Enable（Pro 上係付費 add-on，~US$100/月起，按需要決定。每日備份已足夠基本 RPO，PITR 係錦上添花）。

**Test Restore（建議做一次，留證）：**
1. Dashboard → project → **Database → Backups**
2. 揀一個備份 → **Restore**（⚠️ 會覆蓋現有 DB —— **唔好喺正式 project 做！**）
3. **安全做法**：用 **Branch**（Dashboard → Branches → 新 branch）或開一個臨時 project，還原備份落去，確認資料完整，影低 → 刪 branch。
4. ✅ 截圖「restore COMPLETED + 資料可見」作 A.8.13 證據。

---

## 完成後
喺 [13-certification-readiness-checklist.md](13-certification-readiness-checklist.md) B 段逐項打剔，截圖／PDF 放證據夾。做完 1-5 = ISO 嘅「owner-must-do」清晒，淨低 ~3 個月運行證據 + 內審 + 外部認證機構審核。
