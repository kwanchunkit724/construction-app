# CK工程 vs 香港 DWSS / 工程監督系統 競品分析

> **日期：** 2026-06-18
> **作者用途：** 內部產品戰略 — 釐清 CK 喺香港工程監督軟件市場嘅真實位置、唔好同邊個硬碰、要學邊樣、要 own 邊個 segment。
> **對標基準：** DEVB TC(W) No. 2/2023（DWSS，6 強制模組 + 智慧工地模組 + 24 頁 Annex A 保安/功能規格）+ TC(W) No. 8/2025（2026-04-01 起 >$30M 工程強制）+ Construction 2.0 + iCWP 數據標準化。
> **誠實聲明：** 競品資料來自公開研究（信心度逐間標明）。CK 本身能力以 live code + `.planning/program-2026-06/政府政策吻合分析.md` + `ISO9001-RESEARCH.md` 為實證基礎。本報告刻意唔吹噓 CK，凡 CK 落後嘅地方照寫。

---

## 一、市場全景

> **CK 的定位錨點：** CK 服務嘅係 **DWSS mandate 覆蓋唔到嘅市場** —— sub-$30M 私營/中小工程、判頭（subcontractor）+ 工地主任層、WhatsApp+紙張現狀。下表絕大部分競品都喺 **>$30M 政府基本工程 + 大承建商** 嗰一端，同 CK 唔同 segment。

| # | 系統 | 公司 | 類型 | 目標客群 | 一句定位 |
|---|------|------|------|----------|----------|
| 1 | **Novade DWSS** | Novade Solutions（新加坡，HK 觀塘辦） | dedicated-dwss + site-mgmt 平台 | 大承建商 / 政府基本工程 / 發展商（tier-1：華懋、新世界、中建、Dragages、協興） | 「香港 No.1 DWSS」—— 全 6 模組 + SSSS 智慧工地嘅企業級重型平台 |
| 2 | **viAct DWSS** | viAct.ai（香港，2016 創） | dedicated-dwss + AI-camera (point) | 大/中承建商、基建安全合規部門（HK/星/沙特/杜拜） | DWSS 表單 + AI 電腦視覺工地監察（自動填安全檢查）嘅本土 AI 玩家 |
| 3 | **SnagR DWSS** | SnagR Ltd（英國源，HK 銅鑼灣辦） | dedicated-dwss（snagging 出身） | 大承建商 / 政府基本工程 / 發展商 | 由全球 snagging/QA 工具改造嘅 HK DWSS，drawing-pin 缺陷管理見長 |
| 4 | **isBIM DWSS (Jarvis freeFORM)** | isBIM Limited（香港，2010；MTR Lab 投資） | dedicated-dwss + BIM/CDE 生態 | 大/中承建商、政府工務部門（CEDD/路政/房署/機電） | 透明定價（$28k/$48k/年/項目）+ JARVIS 生態 + CITF 預批嘅本土 DWSS |
| 5 | **CHAIN DWSS** | CHAIN Technology（香港，2016，科學園） | dedicated-dwss + digital-twin/4S | 大承建商 / 政府基本工程（機場/鐵路/渠務/水務） | 數碼孿生 + BIM/實景模型 + IoT 強項嘅 DWSS |
| 6 | **TransTrack DWSS** | C-Smart / 海宏（中建香港 CSCEC-HK 旗下） | dedicated-dwss + 4S 生態 | 大承建商（尤其 CSCEC 系）/ 政府基本工程 | 由一線承建商親自起、跑緊真實公共工程（故宮/中大醫院/中九龍幹線）嘅 DWSS |
| 7 | **Yonyou DWSS** | 用友香港（母公司北京用友，上交所上市） | dedicated-dwss + ERP 生態 | 大承建商 / 政府基本工程 / GBA 跨境承建商 | ERP 級後盾、可延伸到財務/HR/採購嘅 DWSS（合規入門 + 整廠 ERP 上攻） |
| 8 | **Asite DWSS / Adoddle** | Asite Solutions（英國） | CDE/document + DWSS 配置層 | 大型/企業承建商、政府基建、顧問/PM 行 | 由全球 CDE 用 AppBuilder 配置成 DWSS 合規嘅文件控制平台 |
| 9 | **Ambit DWSS** | Ambit Geospatial（香港，2013） | dedicated-dwss（GIS 出身） | 政府工務承建商/顧問（>門檻基本工程） | 地理空間/航測/BIM-GIS 血統嘅本土 DWSS 挑戰者（認證/CITF 狀態未確認） |
| 10 | **VHSmart DWSS** | VHSoft（香港，~2001，有利集團系） | dedicated-dwss + 出勤/門禁/AI 安全 | HK 大/中總承建商（公共基本工程） | 40 年承建商 DNA、「數碼化流程而非表單」、CITF 預批嘅老牌本土 DWSS |
| 11 | **Oracle Aconex** | Oracle（美國，2017 收購 Aconex） | CDE/document（非 DWSS） | 超大型基建/巨型工程業主（機場局、港鐵）、EPC/JV | 全球巨型工程嘅 de-facto CDE — 不可竄改多方往來記錄嘅文件脊骨（DWSS 餵入佢，唔係 DWSS 本身） |
| 12 | **Bentley ProjectWise + SYNCHRO** | Bentley Systems（美國，NASDAQ:BSY） | CDE/document + BIM/4D（非 DWSS） | 大型基建/政府工務、AEC 工程行、巨型工程 | ISO 19650 BIM-mandate 嘅 CDE + 4D 排程脊骨（DWSS 坐喺佢之上，唔係 DWSS） |
| — | **CK工程（本品）** | 單人創辦 | **site-mgmt（SME/判頭層，DWSS-inspired）** | **私營/中小判頭、sub-$30M 工程、判頭+工地主任+判頭工人** | **替代 WhatsApp+紙+Excel 嘅手機優先、廣東話、防篡改證據鏈、平到中小判頭用得起嘅工地管理 App** |

**讀表重點：**
- 1–10 全部係 **DWSS（政府監督合規）** 賽道，全部 enterprise/quote-based 定價，全部 target >$30M 政府基本工程 + 大承建商。CK **唔喺**呢條賽道。
- 11–12（Aconex / ProjectWise）係 **CDE/文件脊骨**，連 DWSS 都唔係 —— 係 DWSS 坐喺佢上面嘅底層。同 CK 完全唔同 league。
- CK 係表入面 **唯一** 真正 target SME/判頭、唯一手機優先 self-serve、唯一單人營運、唯一 live-on-App-Store-畀真判頭用緊嘅。呢個「空白 segment」就係全份報告嘅核心結論。

---

## 二、逐間詳檔

### 1. Novade DWSS  ·  信心度：高
- **模組：** 全 6 DWSS 模組（RISC、工地日誌、安全檢查、清潔檢查、勞工申報 GF527、合約管理）+ 廣闊平台（Quality/Safety/Activity/Workforce/Logistics/Maintenance）+ ePTW、ITP、圖則/文件管理、交付/缺陷管理 + SSSS（AI 影像、IoT、BIM/GIS、人員/機械定位、smartwatch、AI Suite）。
- **關鍵能力：** 全 DEVB mandate 模組齊，configurable submit/review/endorse workflow；數碼簽名 + 自動編號 + RISC 重提交連結（符 TC(W) 3/2020）；iOS+Android 離線現場捕捉；Novade Insights 實時多工地 dashboard；企業保安（2FA、TLS 1.2+、Tier-3 機房、ISO/IEC 20000）。
- **強：** 最強香港合規 fit + CITF 預批；tier-1 採用實證（華懋：5 項目、128,000+ 缺陷相、16,000 數碼檢查、缺陷處理由幾個月縮到 ~3 日）；平台廣度涵蓋整個工地生命周期；SSSS 深度（AI/IoT/BIM）；雙語 EN+zh-HK + 本地夥伴 Spatial Technology。
- **弱：** 貴（reviews 屢次點名 pricey）；客服被批反應慢；大檔案 crash、相片偶爾存唔到；通用全球平台改造成 HK，DWSS 只係大套件其中一個能力 → 對只需監督合規嘅買家偏重；合約管理模組公開資料薄。
- **HK 註：** 自稱香港 No.1 DWSS；明確對齊 Construction 2.0 + DEVB + SSSS。對 CK 而言 = 同一市場嘅 enterprise/政府重型端，**只有當 CK 去追 DEVB 基本工程合規時先正面交鋒，否則唔同 segment**。
- **定價：** 用量/訂閱制，傳聞入門 ~US$1,000+/月起，按用戶/項目/模組擴展；quote-based 企業銷售；CITF 預批可抵成本。

### 2. viAct DWSS  ·  信心度：中
- **模組：** 5 法定模組 + 合約管理 + viHUB dashboard + AI 安全/SSSS(4S) add-on（PPE 偵測、危險區入侵、人機碰撞、密閉空間氣體、吊運區、smartwatch/helmet、e-PTW、smart lock、IoT）。
- **關鍵能力：** 把 5 法定流程數碼化 + **獨家差異化**：用 scenario-based AI 電腦視覺（接駁現場 CCTV via RTSP）自動填「工地安全檢查記錄」，而唔係淨手動填表；viHUB 單一 dashboard 整合表單+鏡頭警報+IoT；雙語 EN+繁中。
- **強：** 本土 HK 公司（2016）為本地法定脈絡而建；獨有 AI/CV moat（唯一主流 DWSS 用實時 CCTV 危險偵測自動填安全檢查）；強信號（US$7.3M A 輪、Forbes Asia 100、WEF Tech Pioneer 2023、CITF 認可、50+ HK 部署）；廣闊 AIoT 生態；G2 4.8/5。
- **弱：** 唔係 purpose-built 法定 DWSS/CDE —— 核心 R&D 係 AI 安全鏡頭，DWSS 係上面 layer；查唔到正式 DEVB/CIC 認可 DWSS 名單或具名政府 DWSS 部署；DWSS 作為 workflow 產品嘅獨立驗證薄（~4 G2 reviews）；Smart Document Management（DWSS 三大核心之一）證據不清；per-camera + IoT 硬件模式對 SME 太重；冇鏡頭嘅工地會退化成普通電子表單。
- **HK 註：** 最近似「本土 HK AI 競品」，但玩企業/政府基本工程 + 鏡頭硬件，同 CK 嘅 WhatsApp-替代 SME 定位唔同 segment。
- **定價：** AI 鏡頭模組「from US$200/camera/module/月」；DWSS workflow 本身 quote-based（信心低）；CITF 適用。

### 3. SnagR DWSS  ·  信心度：中
- **模組：** eRISCF/RISC（連 ITP）、工地日誌、安全檢查、清潔檢查、勞工申報 GF527、合約管理（聲稱）、缺陷/交付管理、混凝土強度/交付追蹤、進度監察、自動報告/BI、文件管理。
- **關鍵能力：** drag-and-drop 自訂表單建立器；drawing-based 缺陷釘圖（SnagR snagging 血統）；MS Project/Asta/Primavera 排程匯入 + Aconex/Primavera Cloud 整合；全離線捕捉一鍵同步；繁中+簡中 UI。
- **強：** dedicated HK DWSS 涵蓋全 5 模組；長 HK 往績（2010 起，金門 Tamar 政府總部；屯赤連接路、市建局）；CIC 名錄 C000204 + CITAC + CITF 相關；成熟 inspection/snagging 引擎跨 50 國 5,000+ 項目；強 BI 報告。
- **弱：** 不透明 enterprise quote-only 定價（第三方引 ~US$2,500/feature）；獨立 review 極薄（Capterra ~4.0 單一 2019 review）；DWSS 係全球 QA 工具嘅重新包裝，非 HK-native build；重型 UX（「填表慢」「要多工具」）；**研究時 dwss.com.hk 官網 TLS 握手失敗載入唔到**（合規 portal 嘅可靠性紅旗）。
- **HK 註：** 為 DEVB mandate 而建，輸出 DWSS 標準 PDF/Excel；enterprise-leaning，唔 target 細判頭預算。
- **定價：** quote/enterprise only（Project License vs Enterprise License）。

### 4. isBIM DWSS (Jarvis freeFORM)  ·  信心度：高
- **模組：** RISC/eRISCF、工地日誌、清潔檢查、勞工申報、安全檢查 + drag-and-drop 自訂表單（聲稱 500+ 模板）+ configurable 多方審批 workflow + dashboard/分析 + 物料送審/RFI/工地備忘 + 缺陷追蹤 + JARVIS CDE/SSSS/Eagle Eye digital twin/BIM 整合。
- **關鍵能力：** 品牌 Jarvis freeFORM（CITF 預批 PA20-120），屬 JARVIS SaaS 套件（15+ apps）；網頁 portal + 手機現場 app；原生整合 sibling JARVIS 模組；vendor 提供 consultancy/客製/training。
- **強：** purpose-built DEVB mandate；強本土 credibility（2010 起、MTR Lab+Gobi+C Cheng 投資、Autodesk ATC、BSI/CIC、2,000+ 項目）；重政府/大發展商往績（CEDD/路政/房署/機電、太古、新地、中建）；**透明 CITF 定價**（$28k Quick / $48k Professional 每年/項目，**unlimited users**）—— 比 Yonyou 平、比同行透明；整合套件可整合 CDE+SSSS+digital twin。
- **弱：** CITF 入面有標準 caveat「has certain DWSS functions which the vendor shall be inquired」—— 全規格合規要逐合約確認；公開資料營銷化、零獨立 review；最大價值要買整個 JARVIS 生態 → lock-in；模板經濟（超出 20/50 模板要 $2,000/張）；per-project 非 per-org（多工地重複付）；離線/e-sign/data-residency 細節 gated。
- **HK 註：** 為 DEVB DWSS 制度而建；DEVB 報告至 2024 已有 ~HK$2,000億工程採用 DWSS。對 CK：同詞彙（RISC/工地日誌/PTW/勞工）但唔同價位、規模、合規姿態。
- **定價：** **$28,000/年/項目（Quick）/ $48,000/年/項目（Professional），unlimited users，CITF 補 ~70%**（CITF 參考價 2022-10，可能已變）。

### 5. CHAIN DWSS  ·  信心度：中
- **模組：** E-RISCF/Survey Check、工地日誌、安全檢查、勞工申報（連工資率/出勤）、清潔檢查 +（同 vendor 鄰接）SSSS/4S AIoT、Digital Twin/Hybrid Reality Platform（聲稱 30,000+ 連接裝置、6,000+ 工人追蹤）。
- **關鍵能力：** 5 法定模組 workflow；**BIM + 實景模型（3D 照片級/點雲）相容**（CHAIN digital-twin 強項）；IoT/AIoT 整合；表單地理參照；open API；相片時間戳；角色權限；dashboard。
- **強：** purpose-built DEVB mandate；實力 HK ConTech vendor（2016 HKSTP，多獎）；強生態（同時供 4S + Digital Twin）；真 BIM+實景+IoT 整合（vs form-only 對手嘅差異化）；大聲稱部署（800+ 項目、200+ 工地、100+ 客）。
- **弱：** 賽道擠擁難差異化（5 模組已商品化）；冇公開定價/CITF code；DEVB 合規隱含聲稱但官網冇列具體 data-interoperability 規格；scale claims 係全公司跨產品（非 DWSS 專屬）；獨立 review/具名 case study 薄；對 SME overkill；DWSS 似次要產品線（identity 重心係 digital twin/4S）。
- **HK 註：** 深度 HK/DEVB 對齊；同時供 mandated 4S。對 CK：enterprise-grade benchmark；其弱點（不透明定價、企業-only、商品化核心、gated 文件）正係 CK 輕量 SME 工具可差異化之處。
- **定價：** 不公開，quote-based；CITF ~70% 補貼。

### 6. TransTrack DWSS  ·  信心度：中
- **模組：** RFI/RISC、工地日誌、安全檢查、環境檢查、人員出勤/勞工、質量管理（物料測試/缺陷）、進度追蹤、圖文報告、分析 dashboard +整合 C-SMART 平台（IoT/機械/物料/環境/測量/中央管理）。
- **關鍵能力：** 網頁 + iOS/Android 雲同步；聲稱 100% 符 5 DWSS 規格；數碼化「人機料法環」；圖文證據捕捉；標準化表單+分析；屬 C-SMART 智慧工地生態（IoT/AI/無人機/BIM/車牌人臉識別閘）；三語（繁/簡/英）。
- **強：** **強政府/基本工程血統 —— 由 CSCEC-HK（中建香港，HKEX 03311）親自起**，一線承建商跑真公共工程；marquee 實證 20+ 項目（香港故宮、中大醫院、河套 I&T Park、中九龍幹線、粉嶺公路擴闊、西鐵錦上路站、將軍澳中醫醫院）；全 DEVB mandate 表單；緊密整合成熟 C-SMART v5.0（首個符 4S 政策）；ISO 27001:2022 + ISO 9001；2024 HK ICT Awards 金+大獎；380+ 部署。
- **弱：** **重要 nuance —— 權威「DWSS」係 DEVB 政府中央 portal，TransTrack 係 vendor/承建商側系統聲稱「DWSS-compliant」，買家要確認佢真係 interop/提交去官方 portal 而非平行 record store**；緊綁 CSCEC 生態（可能為自家大項目優化，獨立 SME 適配存疑 + 向競爭對手 tier-1 買工具嘅 conflict 觀感）；冇公開定價/self-serve；獨立驗證薄（C-SMART app 單一 1 星）；對中小 GC overkill。
- **HK 註：** 為 DEVB DWSS 制度而建，三語（zh-HK 為主）；CITF ~70% 補貼；強具名政府實證。
- **定價：** 不公開，enterprise/contract-based。

### 7. Yonyou DWSS  ·  信心度：中
- **模組：** RFI/RISC（連 ITP，自動 Doc No.）、工地日誌、安全檢查（連環境檢查 + 意外率統計/LD/MD 改善通知/定罪記錄）、清潔檢查（時間戳 + e-sign）、勞工申報（自動計工時/工資）、合約管理（第 6 模組）、Smart Site Application（聚合 IoT/感應器/AI/wearable）+ dashboard/報告 + 接 YonBIP ERP（招標/分判/VO/進度付款 + HR/財務）。
- **關鍵能力：** e-signature 連時間戳記錄所有方；相片證明；submit/approve/reject workflow（桌面/手機）；自訂表單；三語（繁/簡/英）；**open API 供 iCWP 標準化數據抽取**；BIM 相容；2FA + 帳號鎖（5 次）；email/push 通知；可延伸全 ERP。
- **強：** 深 ERP 血統（母公司用友：20,000+ 員工、上交所上市；HK 200+ 員工）—— ERP 級財務穩定性 + 規模；明確對 5/6 mandate 模組 + CITF；自然 upsell 全 ERP；三語 + GBA 跨境定位；命中 iCWP open API/2FA/MDM 級保安。
- **弱：** **公開 DWSS 資料仲講「5 強制模組」（舊 3/2020 框架）—— 現 mandate 係 6 模組（加合約管理 + RISC 嘅 ITP），營銷落後現行通函 = 合規買家紅旗**；DWSS 作為獨立產品偏薄（強項係 YonBIP ERP，具名 HK case study CR Construction 係 ERP 而非 DWSS）；CITF 預批 self-claim 查唔到具體 PA code；ERP-vendor profile = 重型 sales-led 實施，對 SME fit 差、部署慢；冇自家差異化 IoT/AI。
- **HK 註：** 為 DEVB mandate 而建；DWSS 須推標準化數據去 iCWP + 合約完結交還業主。對 CK：合規買家市場，CK 唔玩呢層。
- **定價：** 不公開，enterprise/contract-based；CITF 適用（具體 code 待證）。

### 8. Asite DWSS / Adoddle  ·  信心度：中
- **模組：** CDE（中央文件/數據庫，版本控制/審計）、AppBuilder（drag-and-drop 表單建立器）、文件/圖則管理（IFC/Revit/Rhino、e-sign、stamps）、3D BIM 協作（3D Repo Lite）、Visual Workflow Manager、Field App（離線表單、geotag 相、e-sign）、Power BI dashboard、open REST API、Marketplace 模板庫。
- **關鍵能力：** 用 AppBuilder 把 6 HK DWSS 法定 workflow 配置成表單（明確聲稱符 TC(W) 2/2023）；workflow RISC 表單保留歷史 + 重提交連結；橋接法定表單 + 全企業 CDE；離線捕捉 + geotag 相 + e-sign；手機 BIM markup。
- **強：** 成熟 CDE 深文件/圖則控制、版本史、審計（review 最praise）；廣闊平台（CDE+BIM+表單+workflow+dashboard）；AppBuilder 彈性（紙/Word/Excel 變 web-app）；明確 DEVB DWSS 對齊 + 藍籌 HK 實證（置地、中建、Arup、樟宜機場）；open API 整合。
- **弱：** 唔係 purpose-built turnkey HK DWSS —— 全球 CDE 配置成 DWSS，表單 fidelity 靠 deployment partner；usability 屢被批（cluttered/dated、陡學習、太多功能太複雜、兩個 UI）；search 弱；**冇 zh-HK/廣東話 UI 證據 —— 對 HK 前線管工/判頭係真 gap**；enterprise 定價對 SME 不宜；營銷版本不一（一頁講 6 模組一頁仲講 5 模組）。
- **HK 註：** 公共工程有政府中央 DWSS（dwss.archsd.gov.hk），Asite 最相關係（a）餵/補充法定系統嘅企業 CDE （b）私營項目嘅 DWSS option；本地化（zh-HK）+ 前線 ergonomics 弱過本土對手。
- **定價：** quote-based；第三方指示性 Adoddle Field ~£15-60/user/月，CDE ~$70/user。

### 9. Ambit DWSS  ·  信心度：中
- **模組：** RISC/eRISC（自訂 workflow、自動編號、數碼簽、多工地審批、修正追蹤、審計史）、工地日誌、安全檢查、清潔檢查、勞工申報、合約管理（提及）+ dashboard/報告。
- **關鍵能力：** 網頁中央平台；涵蓋 DEVB mandate 模組；e-sign 多工地審批路由；自動編號 + 修正追蹤 + 審計史（non-repudiation 取向）；手機現場捕捉 + 離線生成；configurable workflow；PDF/Excel 匯出；可 interop Ambit 的 CMP/SSSS/AI CCTV/BIM/LiDAR。
- **強：** 真 HK purpose-built（明確 map TC(W) 3/2020 模組）；強本土 geospatial 血統（2013 起 GIS/3D，服務規劃署/地政署/CEDD）；DWSS 坐喺更全 Digital Construction Site 套件（CMP/SSSS/IoT/AI CCTV/BIM/LiDAR）；**BIM/GIS 整合係原生強項**（直接答 DWSS「link data to BIM elements」）；審計/數碼簽/修正史 fit 公共工程。
- **弱：** **查唔到 DWSS 產品具名 HK 客戶/case study —— 採用實證薄**；**查唔到喺官方 CITF 預批名單或 DEVB 認可 vendor 名單**（HK 基本工程嘅 gatekeeper）= 重大未知；賽道對手強；DWSS 明顯係 Ambit 次要產品線（geospatial/航測/AI-inspection first）→ roadmap focus 風險；產品頁技術細節薄（hosting/data-residency/API/SLA 都冇）；定價完全不透明。
- **HK 註：** dedicated HK DWSS，geospatial vendor 血統；認證/CITF 狀態未確認。
- **定價：** 完全不公開。

### 10. VHSmart DWSS  ·  信心度：中
- **模組：** RISC/eRISC、工地日誌（獨立 Daily Site Diary app）、安全檢查、清潔/環境檢查、勞工申報、缺陷監察、VHSmart 流動出勤記錄器（CIC 出勤 + 生物/人臉門禁）、現場安全管理（AI PPE 鏡頭 VISCMon）、進度監察、質量控制、資產管理（HAOMS）+ 物料追蹤 + BIM+GIS（BIMxVGIS）+ legacy VHBuild CDE。
- **關鍵能力：** 法定表單 + 品牌哲學「數碼化流程而非數碼化表單」（workflow-driven 非電子紙）；workflow 監察 + 自動警報 + 分析 live dashboard；手機優先（多個 iOS/Android app）；相片 + as-built 圖則註解；整合 BIM/CIC 出勤/生物門禁；CITF 預批。
- **強：** 深 HK domain fit（為 DEVB 法定表單 + HK 詞彙而建，由 40 年 HK 承建商有利集團起）；長期本土 incumbent（~2001）有真地面支援（九龍灣）；CITF 預批；真整合套件（RISC/日誌 + 出勤 + 生物門禁 + AI 安全 + BIM+GIS + 資產）；有 iOS/Android shipping app + live dashboard。
- **弱：** **官網 vhsoft.com 有 TLS/cert 問題，產品頁稀疏**；**碎片化 app portfolio（VHSmart DWSS/Issue/Daily Site Diary/HAOMS/BIMxVGIS 各自獨立）—— bolted-together 非統一 UX，用戶要 juggle 多個 app**；極少公開 review/具名 case；不透明 quote-only 定價（雲端 tier DWSS 範圍連 CITF 名單都標「inquire vendor」）；legacy stack feel（VHBuild ASP dot-com 根）；對細判頭 onboarding 重（setup HK$14,400）。
- **HK 註：** 為 HK 法定制度原生而建，CITF 預批，UI HK 取向。注意：CITF 預批 ≠ DEVB 逐項目 DWSS 接受；查唔到具名政府/承建商 VHSmart 部署（只有有利集團 parentage 暗示 credibility）。
- **定價：** vendor-quoted 模組/混合（出勤硬件 HK$21,800/set + 實施 HK$14,400/job + 雲端 HK$400/月 + AI 鏡頭 ~HK$15,000/cam）；CITF 適用。

### 11. Oracle Aconex  ·  信心度：高
- **類型：** CDE/document —— **唔係** HK 法定 DWSS。
- **模組：** 文件管理（registers + 版本控制）、Mail/往來（正式通訊/transmittal/threading）、Workflows、Field（檢查/缺陷/daily report/site diary/手機離線）、Models/BIM Model Coordination、Packages、Tenders/Bids、Cost/Project Controls、Insights、Handover、Supplier Doc Mgmt、Cloud Adapter API。
- **關鍵能力：** 受控文件/圖則/模型 registers + 版本控制；**不可竄改、多方、tamper-proof 往來記錄**（爭議生存證據基礎）；configurable workflow（RFI 周轉減 ~50%）；Open-BIM model coordination（IFC4/BCF2.1）；Field 手機離線。
- **強：** 全球最大基建嘅 de-facto CDE（>600 萬用戶、>US$1 萬億項目價值、~70 國）；HK 巨型工程實證（機場局三跑 HK$1,415億、港鐵/公共工程）；不可竄改多方審計（爭議/仲裁靠呢個）；ISO 19650 對齊；企業級 Oracle 雲。
- **弱：** **唔係 DEVB 認可 HK 法定 DWSS** —— 承建商仲要另一個 DWSS 產品做法定表單，Aconex 係 DWSS 餵入嘅 CDE 脊骨；review 屢批慢/clunky/不直觀 + email 洪水；貴（~US$29-49/user/月，premium ~US$3,000/user/年；實施 US$5k-100k+）；文件/往來為中心，現場執行/IoT/勞工出勤/HK 安全清潔 checklist 較薄；**zh-HK 本地化弱（主要英文企業工具）—— 前線 friction**。
- **HK 註：** 係 DWSS portal 坐喺其上嘅文件/BIM 脊骨，**唔係** DWSS 表單引擎本身。
- **定價：** per-user SaaS enterprise-negotiated（~US$29-49/user/月；premium ~US$3,000/user/年）。

### 12. Bentley ProjectWise + SYNCHRO  ·  信心度：高
- **類型：** CDE/document + BIM/4D —— **唔係** HK 法定 DWSS。
- **模組：** ProjectWise CDE（CAD/BIM/geospatial/Office/IFC/PDF 單一真相源）、文件管理（版本/全文搜尋/審計/redline）、Deliverables Mgmt（ISO 19650）、Engineering WIP、Design Review/clash detection、web+mobile/field、iTwin digital twin、SYNCHRO 4D（model-based 排程模擬）、SYNCHRO Perform/Field（手機 daily 進度/issue/RFI/相+GPS/檢查/daily diary 離線）、SYNCHRO+（2025/26 AI + Bentley Copilot）、AssetWise。
- **關鍵能力：** vendor/file-agnostic CDE 管 CAD/BIM/GIS/Office/IFC/PDF + 智能 reference/dependency；ISO 19650 transmittal workflow + 全審計；緊密整合 BIM authoring（MicroStation/Revit/Civil 3D）+ 排程（P6/Asta/MSP）；SYNCHRO 4D time-location 排序；SYNCHRO Field 推 4D 入現場 workflow；digital twin/iTwin + reality data。
- **強：** 大型政府基建嘅 de-facto CDE+BIM 層（HK 水務署 digital-twin 用 ProjectWise+SYNCHRO+iTwin）；best-in-class BIM-mandate/ISO 19650 合規 + federated-model 管理；深整合大顧問/承建商現用 BIM/排程工具；SYNCHRO 加真 4D + 現場進度；全 design→build→operate digital-twin lifecycle；企業級保安/規模。
- **弱：** **唔係 HK DWSS** —— 唔原生提供 DEVB mandate 模組（RISC/工地日誌/安全/清潔/勞工），HK DWSS 合規由 dedicated portal（Asite/Novade/isBIM/Yonyou…）坐喺其上交付；持續 performance 投訴（慢上下載、15-20 分 sync lag、頻繁 re-login）；重型複雜 admin-intensive（要專職 CDE manager）；對 SME 判頭/前線 overkill + 文化不匹配；不透明高企業定價；UI/UX engineering-tool heavy、英文主導、桌面為中心 —— **唔係 zh-HK 手機優先前線工具**；Bentley 生態 lock-in（SYNCHRO 另計）。
- **HK 註：** 係 DWSS portal + BIM coordination workflow 坐喺其上嘅 CDE/文件/BIM 脊骨，**唔係** DWSS 表單引擎本身；UI 英文/工程取向、桌面+企業，對前線 zh-HK 判頭 fit 差。
- **定價：** per-user 訂閱 + 企業協議（ProjectWise Manage ~US$400/user/年起；企業 floor ~£11,091/季/機房；SYNCHRO 另計）。

---

## 三、CK 對比

### (a) ✅ CK 優勢 — CK 喺呢度真係贏

| 維度 | CK 嘅優勢 | 對手點解輸 |
|------|-----------|------------|
| **防篡改證據鏈** | sha256 hash-chain 審計帳本 + 一鍵 `verify_integrity` + 匯出證明 + 每日完整性 cron。**超出** DWSS §2.5 嘅要求（DWSS 只要 plain log，CK 係密碼學防篡改鏈）。 | 對手有審計史/log，但冇 hash-chain 防篡改驗證可一鍵自證。連 Aconex 的「tamper-proof」係靠 vendor-neutral 託管，唔係可匯出嘅密碼學證明。 |
| **e-sign 不可抵賴** | 簽名證本人 = 簽署時密碼重認證 + 簽名證書（`get_signature_proof`）。直接命中 DWSS §3.1.7（操作前重認證）。 | 多數對手有 e-sign + 時間戳，但「簽名 = 本人 + 可發證書」嘅 non-repudiation 層唔常見，亦少 self-serve 暴露畀 SME。 |
| **廣東話 AI 站長** | AI 站長喺 RLS 內讀真項目數據、用廣東話答工地問題 + 實時天氣 outlook + 預防提醒。 | viAct/CHAIN 有 AI 但係 CV 鏡頭（安全偵測），**冇人有廣東話對話式查工地數據助手**。Asite/Aconex/Bentley 連 zh-HK UI 都弱。 |
| **手機優先易用** | 為 390px 手機 + 平板而建，phone+password 登入，判頭/工人即用，replace WhatsApp。 | 全部對手被批重型/陡學習/enterprise onboarding（Aconex/Asite/ProjectWise 尤甚）；VHSmart 要 juggle 多個 app；isBIM/Novade 要 consultancy/training。 |
| **SME 成本/速度** | 平到中小判頭用得起；live App Store self-serve；單人創辦快迭代。 | 全部 quote-based enterprise 銷售（isBIM 最透明都係 $28k-48k/年/項目）；Aconex/ProjectWise 實施 US$5k-100k+。CK 嘅 TCO 同 onboarding 摩擦低一個數量級。 |
| **被忽略嘅 segment** | 真 own sub-$30M 私營/判頭層 —— DWSS mandate 覆蓋唔到、enterprise vendor 唔願服務嘅市場。 | 1–12 全部明確 target >$30M 政府基本工程 + 大承建商；多份競品 note 直接寫「NOT aimed at SMEs/judos」。**CK 係表入面唯一真 target 呢層嘅產品。** |

### (b) 📚 要學嘅嘢 — 對手真有、CK 真冇

| 來源對手 | CK 缺嘅具體能力 | 學到嘅 lesson |
|----------|-----------------|---------------|
| **Novade / isBIM / SnagR** | **正式 RISC/eRISCF 表單**（申請→檢驗→批 + ITP + 自動編號 + 重提交連結） | CK 有「圖則/文件送審審批 + 進度檢核」近似但唔係正式 RISC/ITP。一個輕量 RISC-lite + ITP/hold-point 模組可借 PTW checklist+signoff primitive 起（亦補 ISO G2）。 |
| **Novade / SnagR** | **缺陷/snagging 釘圖工作流**（drawing-pin 缺陷 → disposition → 重檢 → closure） | CK 有 issues+escalation 但冇圖上釘缺陷 + NCR 分類/disposition/root-cause/effectiveness。直接餵 ISO G1 NCR/CAR。 |
| **全部 dedicated DWSS** | **清潔檢查清單**（DWSS 模組 ④） | CK 完全冇。**最易加**嘅 DWSS 模組（configurable checklist + e-sign + 相），低成本提升合規對齊。 |
| **全部 dedicated DWSS** | **G.F.527 勞工申報月報 + 工資率** | CK 日誌有出勤/人手但冇 GF527 月報。中型工程合規常見要求；可由現有 daily-log 出勤數據 roll-up。 |
| **Yonyou / Asite** | **對外 API / iCWP-ready 標準化匯出** | CK 數據困喺 App。開 Supabase REST/Edge API + 標準化 JSON 匯出 = 「iCWP-ready / 可互通」賣點（ISO/政策吻合分析 G2）。 |
| **Novade / Yonyou** | **登入層 2FA**（生物/OTP） | CK 2FA 係 per-action step-up，登入仍單密碼。加 Capacitor biometric/OTP 登入 = 高合規分、易做。 |
| **viAct / CHAIN / Novade** | **IoT/AI-camera/SSSS 整合** | CK 完全冇。**但呢個刻意唔追**（見 (c)）—— 硬件密集、資本密集、唔啱 SME。 |
| **Aconex / ProjectWise / Asite** | **企業 CDE + BIM/federated-model + ISO 19650** | CK 圖則版本控制係 mini-CDE，但唔做 BIM 模型協作。**刻意唔追**（見 (c)）。 |
| **Yonyou** | **合約管理 NEC 細項**（補償事件/PM 指令/預警/付款/工序） | CK 有 SI/VO 多級審批（HKD）但冇 NEC 全套。NEC 係大政府合約世界 —— SME 一般唔用 NEC，**選擇性追**。 |
| **Asite / Novade / Aconex** | **英文/多語 DB + 國際合規** | CK 純 zh-HK。加英文 i18n 開國際/合規門檻（政策分析 G3）—— 中優先。 |
| **TransTrack（C-SMART）** | **ISO 27001 / ISO 9001 第三方認證** | CK 有底子（hash-chain/加密/RBAC）但「證明」靠自述。攞 ISO 27001 + CITF 認可 = 由自述變第三方硬證明（政策分析 §C，本程序 ISO track）。 |
| **VHSmart（反面教材）** | **統一 UX，唔好碎片化** | VHSmart 碎成多個 app 被批。CK 已係單 app —— 教訓係加模組時保持單一 app 統一 UX，唔好行 VHSmart 嘅老路。 |

### (c) 🎯 差異化定位 — 邊度唔好打、邊度要 own

| 範疇 | 結論 | 理由 |
|------|------|------|
| **政府 DWSS 合規（>$30M 基本工程）** | ❌ **唔好打** | DWSS 係承建商按每張 >$30M 合約自費採購、HKSARG 擁有、合約完結交還政府嘅系統。需 DEVB/CIC 認可 vendor 名單、iCWP interop、企業銷售、政府採購雷達 —— 單人創辦無法 + 唔抵打。CK 對 DWSS 嘅正確用法係攞佢 Annex A 做**免費質量框架/roadmap**，逐步對齊提升專業度。 |
| **BIM / federated-model / ISO 19650 CDE** | ❌ **唔好打** | Aconex/ProjectWise/Asite 係十億美元級脊骨，CK 永遠追唔上亦唔需要。CK 圖則版本控制做到「mini 受控文件系統」已足夠 SME。 |
| **IoT / 感應器 / AI 鏡頭 / SSSS** | ❌ **唔好打** | 硬件密集（per-camera 定價）、資本密集、安裝重。viAct/CHAIN/Novade 已 own。SME 工地一般冇 CCTV 覆蓋，呢個能力對 CK 客戶無用。 |
| **NEC 全套合約管理** | 🟡 **選擇性** | NEC 係大政府合約世界。CK 嘅 SI/VO（HKD 審批鏈）已啱私營/分判層；NEC 細項按真實客戶需求先加，唔主動追。 |
| **SME / 判頭層工地管理** | ✅ **要 own，全力 own** | DWSS mandate 覆蓋唔到、enterprise vendor 明確唔服務（多份競品 note 寫「NOT aimed at SMEs/judos」）。呢個係 CK 唯一可贏、亦冇人爭嘅 segment。 |
| **易用 / 手機優先 / 廣東話** | ✅ **要 own** | 全部對手喺呢度被批重型。CK 嘅 WhatsApp-替代易用度 + zh-HK + 廣東話 AI 係前線判頭嘅真痛點解藥。 |
| **證據鏈 / 爭議生存 / 不可抵賴** | ✅ **要 own（核心 moat）** | hash-chain 審計 + 簽名證本人 **超出** DWSS 最低要求。呢個係中小判頭市場**冇人有**嘅信任武器 —— CK 嘅 No.1 差異化，配上 ISO 27001/CITF 認可由自述升級成第三方證明。 |

---

## 四、改進計劃（Now / Next / Later）

> **設計原則：** 從 (b)「要學」list 揀對 SME 市場有真價值、單人創辦做得起、且回扣 DWSS Annex A 規格 + 現有 CK roadmap（MASTER-PLAN waves v38-v43、ISO gaps G1-G7、政策吻合 B 層）嘅。Effort：S=細(<1 週)、M=中(1-3 週)、L=大(>3 週/多 wave)。**唔追 IoT/BIM/NEC 全套/政府 DWSS 合規**（見三(c)）。

### Now（即做 — 高 ROI、低風險、回扣現有 roadmap）

| 項目 | Effort | 點解對 CK SME 市場重要 | 回扣 |
|------|--------|------------------------|------|
| **合規證明包匯出按鈕** | S | CK 已有 hash-chain + 簽名證書 live，只欠「包裝成證明」。每張 PTW/SI/VO 出單一 PDF + hash 證明 + 簽名證書。對標 DWSS §5.4 交付規格。**最高 ROI** —— 投標/客戶/獎項即用，把現有 moat 變可示人嘅硬證據。 | 政策分析 §A.2；ISO G4 |
| **清潔檢查清單模組** | S | DWSS 模組 ④，CK 完全冇，**最易加**嘅缺模組。借現有 PTW checklist+e-sign+相 primitive。低成本一格提升 DWSS 對齊。 | 政策分析 G8；DWSS 模組 ④ |
| **相片 GPS + EXIF 時間戳元數據** | S | 證據力 —— 對「爭議生存」核心 moat 直接加分。CK 影相已有壓縮，補寫入 GPS+時間 metadata。DWSS §3.1 要求。 | 政策分析 B.② |
| **統一文件唯一識別碼格式** | S | DWSS-format doc ID（模組/類型/6 位序號/修訂碼）。CK 已有部分 DWSS-format doc ID，統一全系統 = 歸檔/檢索/交付專業度。 | 政策分析 G7；FILE-SYSTEM-DESIGN |

### Next（中期 — 補規格差距、提升合規對齊）

| 項目 | Effort | 點解對 CK SME 市場重要 | 回扣 |
|------|--------|------------------------|------|
| **登入層 2FA（Capacitor biometric / OTP）** | M | CK 2FA 係 per-action step-up，登入仍單密碼。生物認證易做、合規分高（DWSS 2FA 登入要求）。對 SME 亦提升信任感。 | 政策分析 G1 / B.① |
| **NCR / CAR 不合格項工作流** | M | 借 issues+escalation primitive 加 NCR 分類 + disposition（rework/accept/concession）+ root-cause + effectiveness check。學 Novade/SnagR 嘅缺陷管理。**直接餵 ISO 9001 G1**（ISO 係 DEVB Approved Contractors 名單標準要求）。 | ISO G1；MASTER-PLAN §ISO |
| **RISC-lite / ITP hold-point 記錄** | M | 借 PTW checklist+signoff primitive 起輕量檢驗申請→批 + hold-point。學 Novade/isBIM/SnagR 嘅 RISC。補 ISO G2，亦令 CK 對 DWSS 模組 ① 由「部分」升「部分強」。**唔做全套正式 RISC**（嗰個係政府 DWSS 範疇），做 SME 夠用嘅輕量版。 | ISO G2；政策分析 模組① |
| **受控文件登記冊（approval-before-release + 讀取確認）** | L | 已喺 MASTER-PLAN Wave 3（v40 file system）roadmap 內。學 Asite/Aconex 嘅文件控制，但做 SME 規模 mini-CDE，**唔追 BIM/federated**。配 approval-before-release + read-acknowledgement = 補 ISO G3。問題 6（圖則改用 file-system PDF）同步落地。 | MASTER-PLAN v40；ISO G3；FILE-SYSTEM-DESIGN |
| **G.F.527 勞工申報月報 roll-up** | M | 由現有 daily-log 出勤數據自動 roll-up 成月報 + 工資率。中型工程合規常見要求；補 DWSS 模組 ⑤。 | 政策分析 G8；DWSS 模組 ⑤ |

### Later（長線 — 第三方證明、互通、國際）

| 項目 | Effort | 點解對 CK SME 市場重要 | 回扣 |
|------|--------|------------------------|------|
| **ISO 27001 認證（+ CITF 預批 / HKICTA 跟進）** | L | 由「自述合規」變「第三方硬證明」。CK 有 hash-chain+加密+RBAC 底子，係最對口認證目標。CITF 預批 = 政府背書 + 客戶可申資助抵成本（追平所有 DWSS 對手嘅 CITF 優勢）。 | 政策分析 §C；ISO27001 啟動評估；COMPETITIONS-RESEARCH |
| **對外 API / iCWP-ready 標準化匯出** | M | 開 Supabase REST/Edge API + 標準化 JSON。學 Yonyou/Asite，但目標係「可互通/可抽取」賣點而非真接 iCWP（嗰個係 >$30M 政府工程嘅事）。提升數據不被困嘅信任。 | 政策分析 G2 |
| **英文 i18n 切換** | M | 純 zh-HK 限國際/合規。加英文開門檻（DWSS 英文 DB 要求 + 海外/合規客）。**保持 zh-HK 為主**（CK 嘅 SME moat），英文係 opt-in 加分項。 | 政策分析 G3 |
| **管理層審查 (Management Review) 一鍵匯出包** | M | 學 Novade Insights dashboard，但做 SME 規模：把進度 snapshot + NCR 統計 + 審計 KPI 一鍵出 management-review pack。補 ISO 9.3。 | ISO G4 |
| **離線寫入佇列 + 重連同步** | L | 現為 Option A 只讀 cache。工地無網時做唔到記錄係真痛點（DWSS 離線暫存+自動同步要求）。但複雜（衝突解決），故 Later。 | 政策分析 G5；offline-mode-scope memory |

**刻意排除（唔做）：** IoT/感應器/AI 鏡頭/SSSS 整合（資本+硬件密集，三(c)）；BIM/federated-model/ISO 19650 CDE（追唔上 Aconex/ProjectWise，亦 SME 無用）；NEC 全套合約管理（大政府合約世界）；正式政府 DWSS 認可 vendor 路線 + iCWP 真接駁（>$30M mandate，單人創辦唔抵打 —— 用 DWSS Annex A 做免費質量框架就夠）。

---

## 五、一句結論

**CK 唔好扮政府 DWSS、唔好追 BIM/IoT/CDE 巨頭 —— 應全力 own 全部 enterprise 對手明文放棄嘅 sub-$30M 判頭/SME 層，用「手機優先易用 + 廣東話 AI + 超出 DWSS 標準嘅防篡改證據鏈」做差異化武器，再用清潔檢查/NCR-CAR/RISC-lite/合規證明包逐格借 DWSS Annex A 提升對齊，最後攞 ISO 27001 + CITF 認可把唯一弱項（自述變第三方證明）補上。**

---

## Executive Summary（畀 caller / 用戶）

**最大 3-5 個 takeaway：**

1. **CK 同所有 12 個競品都唔同 segment。** 第 1-10 全部係 >$30M 政府基本工程 DWSS（enterprise quote-based，多份明文寫「NOT aimed at SMEs/judos」）；第 11-12（Aconex/ProjectWise）連 DWSS 都唔係，係 DWSS 坐喺其上嘅 CDE 脊骨。**CK 係表入面唯一真 target SME/判頭、手機優先、self-serve、live-on-App-Store 畀真判頭用緊嘅產品。** 呢個空白市場就係結論。

2. **CK 真有 3 個贏面 moat：** (a) hash-chain 防篡改審計鏈 —— **超出** DWSS §2.5 plain-log 要求，冇對手有可一鍵自證+匯出嘅密碼學證明；(b) 簽名證本人 e-sign 不可抵賴；(c) 廣東話對話式 AI 站長（viAct/CHAIN 嘅 AI 係安全鏡頭，冇人做廣東話查工地數據）。加埋易用 + 平 + 快迭代。

3. **CK 真有實質 gap 要補：** 冇清潔檢查模組（DWSS ④，最易加）、冇正式 RISC/ITP、冇 NCR/CAR 缺陷工作流、冇 GF527 勞工月報、登入仍單密碼、冇對外 API、純 zh-HK、最大弱項係合規靠**自述**而非第三方認證（對手有 ISO 27001/CITF 預批）。

4. **唔好打嘅戰場（守紀律）：** 政府 DWSS 合規、BIM/CDE 巨頭、IoT/AI 鏡頭/SSSS、NEC 全套 —— 全部資本/硬件/採購密集，單人創辦唔抵打。正確做法：攞 DWSS Annex A 做免費質量框架逐步對齊，唔好扮 DWSS。

5. **「對外證明」係 CK 由好用 App 升級成可證明合規平台嘅關鍵缺口** —— 功能已行得好前，差嘅係把現有 moat 包裝成硬證明（合規證明包）+ 攞第三方認證。

**Top 3 roadmap 項目（即做）：**
- **① 合規證明包匯出按鈕（S）** —— 最高 ROI。CK 已有 hash-chain + 簽名證書 live，只欠把佢包裝成每張 PTW/SI/VO 嘅 PDF + hash 證明，對標 DWSS §5.4。投標/客戶/獎項即用，將最強 moat 變可示人證據。
- **② 清潔檢查清單模組（S）** —— 最易補嘅 DWSS 缺模組（④），借現有 PTW checklist+e-sign+相 primitive，一格提升合規對齊。
- **③ NCR/CAR 不合格項工作流（M）** —— 借 issues+escalation primitive，加 disposition+root-cause+effectiveness，**直接餵 ISO 9001 G1**（ISO 係 DEVB Approved Contractors 名單標準要求），同時學到 Novade/SnagR 嘅缺陷管理能力。
