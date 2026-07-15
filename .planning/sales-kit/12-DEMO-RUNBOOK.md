# 12 — Demo Runbook (自己練版)

15 分鐘 live demo 逐步講稿。每個 scene 三格：**【做】** 撳乜 · **【講】** 逐句照讀 · **【點解】** 點解 work。
先自己練 10 次，計時，練到唔使睇都講得出。

> **黃金守則**
> 1. 頭 2 分鐘**唔好掂 app** — 先講佢嘅痛點，等佢點頭。
> 2. **Demo less > demo more** — 唔好乜都 show，show 到佢「啊呢個 case 我哋都遇過」就夠。
> 3. 每 show 一個 feature，問返一句：「你哋而家點做？」— 等佢自己講痛點。
> 4. 最後**淨係一個 ask**：試一個月 $0。唔好一次過要佢買。

---

## 0. 開場前準備（demo 前 5 分鐘）

- [ ] 手機 / 平板開好，**login 咗判頭** `60001005` / `test1234`，項目 **DC2026 油塘住宅**。
- [ ] 另一部機 OR 同一部準備好切去 PM `60001001` / `test1234`。
- [ ] Wifi 穩定。**後備**：如果驚斷網 → 預先用 `/#/sell` 嘅手機 mock + 錄定嘅 60 秒 Loom，斷網都 show 到。
- [ ] 印好 `/#/takeaway` A4 價目表，放枱面。
- [ ] 心理：你係嚟**解佢問題**，唔係嚟 sell。輕鬆啲。

---

## 1. 開場白（0:00 – 2:00）— 唔好掂 app

**【講】**
> 「多謝你俾時間。我唔即刻 show app，想先問你兩條問題。
> 你哋地盤而家，foreman 嘅 daily 日誌、PTW、物料 request —— 係用咩做？係咪 WhatsApp 加紙簿加 Excel？」

*（等佢答。聽。佢一定會吐苦水。）*

> 「咁如果出 dispute，譬如上個月邊個簽嗰張 PTW、邊日叫嗰批料 —— 你哋而家點揾返記錄？」

*（等佢答。通常係「揾 WhatsApp」「揾紙簿」「揾唔返」。）*

**【點解】** 等佢親口講出痛點，下面你 show 嘅嘢就係「答佢」，唔係「sell 你」。佢已經自己賣咗俾自己。

**過場：**
> 「OK，等我俾你睇下我哋點解決呢樣嘢，5 分鐘。」

---

## 2. 判頭視角（2:00 – 6:00）

### Scene A — 進度一眼睇晒
**【做】** 開項目 → 進度 tab，show 個 progress tree（大項/細項 + 幾個 zone + %）。
**【講】**
> 「呢個係地盤而家嘅進度。判頭、工程師喺電話㩒一下就 update 到 %，office 即刻見到。唔使再喺 WhatsApp 問『做到幾多？』」
**【點解】** 第一眼就係「office-to-site 即時」—— 直擊 PM 痛點。

### Scene B — 物料 + 急件
**【做】** 開 **物料** → show 物料 list，指住**急件**標記嗰項（接駁管 等緊批）。
**【講】**
> 「判頭叫料，可以㩒『急件』。一㩒，老總部機即刻收到 push notification。
> 以前 WhatsApp 叫料，200 條訊息冚過去就唔見咗。而家係一條有時間戳嘅紀錄，邊個叫、幾時叫、批咗未，一目了然。」
**【點解】** 「急件 + push + 有紀錄」三樣一齊，係判頭最痛嘅（料遲到 = 工人 hea = 蝕錢）。

### Scene C — 開單一個進度項目
**【做】** 撳入一個 leaf item（例如水管立管）→ show 需用物料 / 詳情。
**【講】**
> 「每個工序底下自動 link 住要用嘅料、進度、邊個負責。全部一齊，唔使再揭三本嘢。」

### Scene D — 權限（判頭寫唔到 daily）
**【做】** 試去 daily，show 判頭**冇權限寫**（banner / 撳唔到）。
**【講】**
> 「唔係個個都亂改。判頭睇得到、叫得到料，但 daily 報告淨係工程師 / 管工先寫得。每個角色見到同做到嘅嘢都唔同 —— 唔會亂。」
**【點解】** 老總最驚「個個亂改」。RBAC = 信得過。

---

## 3. 切換 老總 / PM 視角（6:00 – 10:00）

**【做】** 登出 → login PM `60001001` / `test1234`。
**【講】**
> 「而家我切去老總 / PM 個 view，睇下 office 嗰邊見到啲咩。」

### Scene E — 4-zone dashboard
**【做】** Show 成個項目幾個 zone 嘅進度 + 統計卡。
**【講】**
> 「同一個項目，PM 一個 screen 睇晒幾個 zone 嘅進度、邊度落後、邊度有 issue。
> 以前要禮拜五先 compile 到 Excel，而家 real-time。你喺寫字樓都知地盤而家點。」
**【點解】** 呢個係 PM 嘅「夢想」buttons（01 personas: 「If I could see all 4 zones in one dashboard…」）。

### Scene F — 加大項 / 指派
**【做】** Show 加一個大項 / 指派俾人（multi-zone peer apply 如有）。
**【講】**
> 「結構改咗、加咗新工序，PM 喺度加一次，幾個 zone 一齊 apply，唔使逐個 copy。指派咗俾邊個，嗰個一登入就見到自己嘅嘢。」

### Scene G — 事件 / 問題上呈
**【做】** Show issue / 事件 + escalation（判頭 → 主任 → PM）。
**【講】**
> 「地盤有問題，報一次，自動跟住層級上呈：判頭 → 工地主任 → PM。每一步邊個幾時處理咗都有紀錄。唔會『我同你講過㗎喎』。」

---

## 4. 大招 — Dispute / Audit Trail（10:00 – 12:00）

**【做】** 隨便撳開一個項目 / issue 嘅歷史紀錄，指住時間戳 + 簽名。
**【講】**（慢、認真講）
> 「呢個係成個 app 最值錢嘅嘢。
> 每一個 action —— 邊個、幾時、改咗咩 —— 都有 timestamp 同簽名，改唔到、刪唔到。
> 出 dispute 嗰陣，你唔需要靠記性、唔需要喺 WhatsApp 揭三個鐘。打開就係證據。
> 我哋自己 sister company 試過，一單 subcontractor dispute 因為呢個 audit trail 直接 resolved。」
**【點解】** 老總 #1 痛點 = dispute 蝕錢。呢度係你嘅 closing 子彈，慢慢講。

---

## 5. Export + 合規（12:00 – 13:00）

**【做】** 一鍵 export PDF / Excel。
**【講】**
> 「今日嘅嘢，一㩒出 PDF，俾 owner、入 dispute file 都得。Excel 都得。」

**【做/講】**（提一提，唔使深入）
> 「另外 —— 帳號刪除、數據加密呢啲合規嘢我哋做齊咗，Apple App Store 都過咗 review。你唔使擔心 data 點。」

---

## 6. 收結 + Pilot Ask（13:00 – 15:00）

**【講】**（停低，望住佢）
> 「我 show 咗咁多，你頭先講嘅 [重複佢嘅痛點，例如『daily 攞唔齊』] —— 你覺得呢個解到唔解到？」

*（等佢答。佢會自己評估。）*

> 「咁不如咁樣：揀你一個地盤、一個 zone，試一個月。**完全免費，HK$0**。
> 我幫你 set 好帳號，你叫判頭、工程師落手用。月底我哋傾 30 分鐘，純粹聽你 feedback —— 唔係 sales。
> 覺得 save 到時間先繼續，唔覺得就算，data export 晒俾你。點都唔逼。」

*（收聲。等佢答。唔好再講。）*

**如果 yes：**
> 「好！我聽日 send 一頁好簡單嘅 pilot 同意書俾你，下星期一就開帳號。」

---

## 7. Q&A 速查（被問到先答，1 句搞掂）

| 佢問 | 你答（1 句） |
|---|---|
| **「幾錢？」** | 「Pilot 一個月 $0。之後 Standard HK$3,800/月 per project。6/30 前簽有創始價 $2,850 鎖一年。」（畀 A4 takeaway） |
| **「太貴喎」** | 「你 PM 而家每日 2 個鐘追 daily，一個月人工都唔止 $3,800 啦。仲未計上次 dispute 賠咗幾錢。」 |
| **「我哋已經有 software」** | 「你用緊嘅多數係 QS（Cubicost）或者 ERP。我哋唔做嗰啲，我哋做地盤層每日 ops，填返 office-to-site 個 gap，唔衝突。」 |
| **「我哋唔識用電腦/app」** | 「Foreman 識用 WhatsApp 就識用呢個。30 秒交 daily，我會落場幫你 set 同教。」 |
| **「我考慮下」** | 「明白。下禮拜五前我 follow up。期間有問題隨時 WhatsApp 我。」（之後 send Loom video） |
| **「data 安全嗎？」** | 「加密 at rest + in transit，Apple review 過，帳號刪除合規，data 喺 Singapore region。」 |
| **「邊個用緊？」** | 「我哋 5 月底先上 App Store，你會係頭 10 個付費客之一 —— 所以有創始價護住你個價。」 |

---

## 8. 練習 tips

- **練 10 次**，計時，目標 ≤ 15 分鐘。Demo（Scene A–G）≤ 8 分鐘。
- 自己錄低自己講一次，play 返聽 —— 你會聽到邊度太長。
- **背熟過場句**（每個 scene 之間嗰句），中間 show 乜可以隨意。
- **後備**：斷網 → 開 `/#/sell` 手機 mock + Loom video。
- 唔好讀稿。呢份係練嘅，見客時係**對話**，唔係 presentation。

## 9. 唔好做（from 03）
- ❌ 唔好講 "revolutionary" / "AI" / "save 50%" / "world's first"
- ❌ 唔好一次過列晒功能
- ❌ 唔好 demo 超過 8 分鐘
- ✅ 具體痛點、具體 outcome、易 demo、易抽身

---

**配套**：`05-DEMO-SCRIPT`（原版 20 分鐘）、`07-OBJECTION-HANDLERS`（12 個異議詳答）、`/#/takeaway`（價目）、`/#/sell`（事後 send link）。
