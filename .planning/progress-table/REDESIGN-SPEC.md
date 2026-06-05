# 進度表密度重設計 — 實作記錄

> 目標：太多掣、一頁得 3-4 項 → compact、一頁 ~8 項。App + web 同一 component
> (`src/components/ProgressItemCard.tsx`)。多角色 workflow 中途 fail（一個 agent 冇
> 出 StructuredOutput），改為直接按已驗證設計落 code。

## 改咗乜

### Compact row（預設）
單行卡，padding 收細，每項 ~56px（之前 ~140px+）：
`⌄ 編號 [分區] 標題(truncate) ──進度bar── 實際% 差距% [狀態icon] [更新] [⋯]`
- 狀態：手機只顯示 icon（`hidden sm:inline` 文字），慳闊度；平板/web 有文字。
- 差距：落後紅、超前綠。

### 掣：6 個 → 1 + kebab
- **inline 主掣 = 更新**（管工日日撳，leaf + 有 update 權先出，橙色筆 icon）。
- **⋯ kebab** 收埋其餘：圖則 / 指派 / 歷史 / 加細項 / 刪除（刪除 confirm 喺 menu 內）。
- contributor（只可改自己項）→ 得 inline 更新（+ 圖則 if any），冇結構掣。RBAC 不變。

### 點先展開
- 每行可展開。**大項/中項** 展開 → 仔項（原本行為）。**細項** 展開 → 詳情：
  備注 / 負責人 chips / 圖則 / **需用物料 panel**。
- 細項一定可展開 → 確保 linked 物料仍然搵到（之前 inline，而家收埋落 expand）。

### Toolbar
- 「加入大項」維持喺進度頁頂部 toolbar（非每張卡）。

## 保留（do-not-break）
- RBAC：contributor 只可 update 自己 leaf；supervisor 先有 指派/歷史/結構/刪除。
- Tree 結構 + rollup（中/大項自動匯總 %/狀態）。
- 44px 觸控（更新/kebab/menu row 都 ≥44px-ish）。
- 樓層 badge、自動匯總、分區 chip、狀態色。

## 驗證
tsc + build green。Playwright @ 390px（test PM, DC2026 4 分區 35 項）：一頁見到
~8 項（之前 3-4），更新 + kebab 正常，截圖確認。

## 未做（follow-up）
- 急件物料 indicator 喺 compact row（而家收咗落 expand）。
- Swipe action（手機左掃露更新/指派）。
- 分區內隱藏重複分區 chip。
- 「只我負責 / 只睇落後」filter（同 export picker 一套）。
