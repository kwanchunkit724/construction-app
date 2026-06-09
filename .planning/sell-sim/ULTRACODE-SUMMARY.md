# Ultracode — 兩次 session 總結

## 背景
App 準備出售，要確保穩定、無 bug。期間用咗兩次 ultracode（多 agent 並行編排）。

---

## Ultracode #1 — 售前全角色模擬計劃 + 修 P0

**做咗咩**
- 8 個 role-agent 並行讀 code（admin / PM / 工地主任 / 總承建商 / 判頭 / 工人 / 業主），各自整出：
  - 能做嘅功能 + route + click-by-click 測試步驟 + 預期
  - 唔准做嘅（button 收起 / RLS 拒 / 唯讀）+ 點 verify gate
  - 跨角色 handoff
- Synth 出 `SIMULATION-PLAN.md`：權限矩陣 + **22 步由零開始協作 lifecycle** + **11 條 bug watchlist**。

**結果**
- Plan committed（`.planning/sell-sim/`）。
- Agent 讀 code 即捉到 11 bug（BW-01…BW-10 + BW-NEG）。修咗 3 條 **P0**：
  - **BW-09**：`AssignmentModal` 冇工人選項 → 工人核心工作無法分派。已加 委派判頭/工人。
  - **BW-06**：admin 角色選擇器漏咗 `general_foreman` + `safety_officer`。已加。
  - **BW-01**：加 大項/中項/細項 權限睇 **global role** 而唔係 **per-project membership role** → 一個 project 嘅 PM（global=main_contractor）加唔到大項。`v27` migration 改兩個 server function（manage + visibility）用 membership role；client `canManageStructure` 跟住改。
- Code pushed（`d889eb1`）。

**仲要做（你嗰邊）**
- ⚠️ **`supabase/v27-progress-rights-by-membership.sql` 要喺 Supabase SQL editor 跑**（compact 時截斷，未確認跑咗）。跑完 BW-01 先真正 close。
- 其餘 P1（BW-02/03/04/05/07/10：UI 顯示但 RLS 拒 / approve 盲審）未修 — 唔阻基本流程，下一輪處理。

---

## Ultracode #2 — 計劃進度 邏輯 bug 修復

**問題**：加項目時要手動填「計劃進度 %」— 冇意義。應該由排期自動計。

**做咗咩（直接實作 + agent 審查）**
- `plannedProgressOf(item, today)`：由 `planned_start → planned_end` 對今日線性計，**inclusive days**（開始日 = 第 1 日）。例：Day1→Day15（15 日），今日 Day3 → 3/15 = **20%**。開始前 = 0，完成日後 = 100，無日期 = 未排期。
- 加 `scheduleVariance` / `isScheduled`；`computeRollup` 改用 derived planned。
- `CreateItemModal`：**移除 slider** → 只留 計劃開始/完成 date picker + 唯讀自動預覽 + end≥start 驗證。
- `ProgressItemCard`：planned/status live derive；variance badge 顯示 **落後/超前/未排期**。
- `UpdateProgressModal`、`ProgressContext`、`export.ts` 全部改 derived planned → 報告顯示真排期落後/超前。
- 無 DB migration（日期欄本來已有；stored `planned_progress` 變廢欄）。

**4-lens 對抗審查 → 捉到 3 confirmed defect（全部已修）**
- **P1**：`computeRollup` 將未排期 leaf（planned=0）一齊平均 → 拉低 parent/zone planned，假裝 超前。改成只平均**已排期 leaf**，加 `scheduledCount`。
- **P1**：export KPI 狀態統計讀**舊 stored status**，同 rows/verdict 矛盾。改成 `deriveStatus(actual, plannedProgressOf(l))`。
- **P2**：card tooltip 喺 diff∈[-5,-1] 已叫「落後」，但 color/status/modal 用 5% 容差。tooltip 對齊 5%。

**結果**
- Feature pushed（`ea6870c`）+ 審查修復 pushed（`295abbf`）。TSC + build 全綠。

---

## 提交記錄
| commit | 內容 |
|---|---|
| `519c23a` | v26 修新用戶見唔到工地（project discovery RLS） |
| `d889eb1` | P0 修復：worker assign + role picker + v27 progress rights |
| `ea6870c` | 計劃進度 由排期 auto-derive + variance |
| `295abbf` | 審查修復：scheduled-only rollup + live KPI counts + tooltip |

## 淨低 ACTION
1. ⚠️ 跑 `v27` migration（如未跑）。
2. 出街前驗證：用 member_role=pm（global≠pm）試加大項；用工人帳戶試被委派 + 更新；admin 試設 安全主任 role。
3. P1 watchlist（BW-02/03/04/05/07/10）下一輪。
