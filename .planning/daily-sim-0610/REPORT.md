# 地盤日常模擬報告 — 2026-06-10

事件驅動模擬（每個 agent 跑一個真實工地事件），對住 LIVE Supabase，用真 persona REST 身分行。
14 個 case 派出去，session token limit 中途爆（4:40am HK 重置），但每個 agent 邊行邊寫
evidence 落 `.planning/daily-sim-0610/`，所以 finding 由 disk 救返。

## 執行摘要

- **3 個真 backend bug 確認**（其中 1 個係 P0 級「以為修好其實冇上 prod」的回歸）。
- **6 個 case 證實乾淨**（RLS 雙向都正確）：issue 升級鏈、issue 翻發、圖則上載＋版本＋權限、
  聯絡人權限、新工人入職的 membership/approve、每日日誌的讀取＋今日編輯窗。
- 修復：`supabase/v35-daily-sim-fixes.sql`（3 個 fix，idempotent）。
- ⚠️ **v35 未上 prod** — Supabase 登出咗，等你登入 SQL editor。上完我會**執行驗證**（唔係淨係睇 source，
  v33 就係因為淨係睇 source 漏咗）。

## Per-case 結果

| Case | 結果 | 重點 |
|---|---|---|
| issue-escalation | ✅ PASS | 鏈正確（管工→pm／判頭→總承建商）；升級／評論／解決全對；判頭解決他人 issue → RLS 0 行（正確拒絕） |
| issue-reopen | ✅（鏈乾淨） | reporter／handler 翻發；非 handler 拒絕 |
| drawing-upload | ✅ PASS | v1→v2 supersede 正確；判頭＋老總 insert/storage 全部 42501 拒絕；讀取放行；DB＝client（general_foreman 已移除） |
| contacts-gate | ✅ PASS | 老總＋管工 insert → 403 拒絕；PM insert 成功；判頭讀到；client `canManage=admin\|\|pm` 與 DB 一致 |
| daily-log | ⚠️ 1 BUG | 角色／今日編輯窗／讀取全對，但 insert 冇 date 守衛（見 BUG-2） |
| worker-onboard | ⚠️ 1 BUG | signup＋apply＋PM approve 正常，但 approver RPC 仍然爆（見 BUG-1） |
| si-vo-chain | ⚠️ 1 BUG | 空 SI 入到審批鏈（見 BUG-3） |
| delegate-progress-audit | ◐ 未完成 | session limit 中途斷，只行到 assign step，未驗到 v34 history policy — 下輪重跑 |
| timetable / material / edit-item / ptw / floors / export | ◐ 未跑 | agent 喺 setup 階段就俾 limit 殺，得 token/probe 檔，冇 case log — 下輪重跑 |

## 確認嘅 BUG（已修，待上 prod）

### BUG-1 — `admin_or_pm_list_applicants` 仍然 runtime `42702 column "id" ambiguous`（P0 回歸）
- **症狀**：PM／管工／判頭叫呢個 RPC 全部爆 `42702` → 審批人睇唔到申請人姓名（「無法載入申請人資料」，正是上次嗰個 BW-10 症狀）。
- **真相**：repo 嘅 v33 body 係啱嘅（全部 column 都有 `up.`／`p.` qualifier），但 **prod 從來冇真正換過** —
  仲行緊上次手打入去嘅 v31（`where id = auth.uid()` 冇 qualify，撞到 OUT param `id`）。v33 嗰次 Chrome 上 SQL
  中咗 stale-monaco，靜靜雞冇 apply 成功，而當時「驗證」只係讀 source text 所以冇發現。
- **證據**：`log-worker-onboard.txt` step 7/8/8b — 三個 caller 全部 `{"code":"42702",...}`。fallback（直接讀 user_profiles）有效，所以 app 個 card 可能仲撐得住，但 RPC 本身死。
- **修復**：v35 重貼正確 body（aliased），今次**用執行驗證**。

### BUG-2 — `dailies_insert` 冇 date 守衛 → 可篡改日誌（P1，審計完整性）
- **症狀**：foreman／engineer 經 API 可以 insert 任何日期嘅日誌（補寫尋日、甚至未來）。schema header 寫明「yesterday's diary stays locked」，但只有 UPDATE/DELETE 守今日，INSERT 淨係查 role＋membership。
- **連鎖**：補寫嘅 row 仲變咗**永久** — delete/update policy 鎖死非今日，作者自己都改唔到、刪唔到。
- **證據**：`log-daily-log.txt` step 4 — backdated `date=2026-06-09` insert 成功（id 8e49641d）；step 5/5b PATCH/DELETE 都 0 行。
- **修復**：v35 喺 insert `with check` 加 `date = (now() at time zone 'Asia/Hong_Kong')::date`，並清走嗰條 backdated 測試 row。

### BUG-3 — `submit_si` 接受空 SI 入審批鏈（P2，工作流死局）
- **症狀**：`submit_si` 查 creator＋status＋鏈配置，但冇查 SI 有冇內容（`current_version_id`）。空 SI submit 咗就卡死：in_review、冇 version、之後 version insert 又俾鎖、resubmit 又話「不能從狀態 in_review 提交」。
- **證據**：`log-si-vo-chain.txt` FINDING-A — submit_si 成功而 `current_version_id=null`。
- **修復**：v35 喺 status 翻 in_review 之前加 `if v_si.current_version_id is null then raise ...`。

## 否決嘅疑點

- 「老總加聯絡人應該成功」→ **否決**。係我 brief 嘅錯誤假設；產品設計就係 admin/PM only，老總 read-only，client `canManage` 同 DB 一致。冇 bug。
- daily-log / si-vo 嗰啲 `PGRST102 Empty or invalid json` → **否決**。係 Windows curl 嘅 UTF-8 argv 編碼問題（測試工具），唔係 app bug；改用 `--data-binary @file` 就冇事。

## 殘留測試資料（`[sim-0610]` tag，需清）

issues ×3、dailies ×3（含 1 條 undeletable backdated，v35 會刪）、contacts ×1、drawings ×1＋versions ×2＋storage 2 檔、
project_members 1（測試工人 approved）、SI SI-002（卡 in_review）、tagged progress 改動。
v35 清 backdated daily；其餘 `[sim-0610]` row 可留待下輪一次過清，唔影響 live admin view（全部 tag 住）。

## 一句總結

跑出 3 個真 bug，最重要係發現 **v33 其實冇上到 prod**（approver RPC 仲爆緊）。3 個都修咗入 `v35`，
**等你 Supabase 登入後我即刻 apply + 執行驗證**。乾淨嘅 6 個 case 證明 issue 鏈、圖則權限、聯絡人 gate 穩陣。
未跑完嘅 6 個 case（timetable/material/edit/ptw/floors/export）下輪 session 重置後補跑。
