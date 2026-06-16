import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ListChecks, AlertCircle, LayoutDashboard, FileText, FileCheck2, ShieldCheck,
  CloudRain, Package, BookOpen, CalendarDays, Contact as ContactIcon, Image as ImageIcon,
  Wrench, Bot, KeyRound, UserCheck, Settings2, FileDown, FileSignature,
  WifiOff, BellRing, Trash2, Megaphone, ChevronDown, ChevronRight, Search,
} from 'lucide-react'

// Public in-app feature-showcase at /#/demo — for live presentations.
// Presents EVERY function from .planning/sim-2026/function-inventory.json
// (23 entries) grouped into sections, each rendered as a card with a
// highlighted 講解 (talking-points) box. NO network — the inventory is
// inlined below. zh-HK, mobile-first (390px) → tablet (1600x900).
//
// Matches the in-app surface style (site/safety palette, .card / .btn
// classes) rather than the dark blueprint /sell aesthetic.

type FnEntry = {
  key: string
  title_zh: string
  route_or_location: string
  what_it_does_zh: string
  roles_zh: string
  key_actions_zh: string[]
  demo_talking_points_zh: string[]
}

// ── inventory (inlined from .planning/sim-2026/function-inventory.json) ──
const INVENTORY: FnEntry[] = [
  {
    key: 'progress',
    title_zh: '進度追蹤（大項／中項／細項 + 計劃進度）',
    route_or_location: 'ProjectDetail 進度分頁（/project/:id，tabId=progress，核心模組永遠開）',
    what_it_does_zh:
      '用三層結構（大項→中項→細項）拆解成個工程，由監督層搭骨架、指派負責人或委派判頭／工人。前線只喺最底層細項更新百分比或樓層完成，系統由下而上自動加總，並按計劃開工／完工日即時計出『今日應做到幾多%』，得出落後／超前。每次更新都保留歷史做存證。',
    roles_zh:
      '建結構／指派／睇全棵樹：系統管理員、本項目項目經理、老總／工地主任、總承建商（監督層）。判頭／判頭工人：只睇到並更新派俾自己嗰啲細項。業主：唯讀，未獲指派乜都唔見。',
    key_actions_zh: [
      '加大項／中項／細項，填編號、名稱、計劃開工／完工日、追蹤模式（百分比或樓層）',
      '喺細項指派負責人（總承建商／判頭）或委派判頭／工人',
      '前線喺細項撳橙色『更新』填新百分比或剔樓層加備註',
      '系統由細項向上平均加總，並用實際 vs 計劃自動定狀態（未開始／進行中／落後／完成）',
      '睇細項『歷史』時間線（誰、何時、數值、備註）',
    ],
    demo_talking_points_zh: [
      '呢個係唯一關唔到嘅核心模組——所有其他功能可以逐個項目關，進度永遠開。',
      '重點講『自動加總』：前線只郁細項，上層大項百分比自動跟住變，項目經理同老總即刻喺自己部機見到，唔使人手通知或填上層。',
      '落後／超前唔係人手填——你只填日期，系統按今日喺工期之間嘅位置線性計（例如 15 日工期到第 3 日 = 20%），相差超過 5% 先標紅落後。',
      '每次更新留低歷史做存證，正正係用嚟追數同打官司對數。',
      '強調權限：判頭工人預設一片空白係正常——要監督層喺工序上委派佢，佢先見到嗰幾條，避免亂。',
    ],
  },
  {
    key: 'issues',
    title_zh: '問題（報告 + 升級鏈 + 處理／解決／重開）',
    route_or_location: 'ProjectDetail 問題分頁（tabId=issues）+ 問題詳情 /project/:id/issue/:issueId',
    what_it_does_zh:
      '工地任何已加入成員都可以影相開問題單，系統按開單者角色自動把第一個處理人交畀上一層。處理人搞唔掂可以逐級『上呈』直到項目經理為止，亦可留言跟進、標記已解決、之後任何成員發現未搞掂可重開——所有記錄保留。',
    roles_zh:
      '凡本工地已加入成員（判頭工人／判頭／總承建商／業主／項目經理／安全主任／系統管理員）都可以開單同睇單。升級鏈：工人→判頭→總承建商→項目經理（終點）。非本工地成員睇唔到。',
    key_actions_zh: [
      '影相、填標題同描述，提交問題單（報告人一定係自己）',
      '系統按開單者角色自動定第一個處理人（工人開單→判頭處理）',
      '當前處理人／報告者／管理員撳『上呈到上一層』並填原因',
      '留言跟進、標記『已解決』',
      '任何成員發現未真正搞掂可『重開』，記錄全保留',
    ],
    demo_talking_points_zh: [
      '強調『自動路由』：唔使揀交俾邊個，系統按你嘅角色就知交上一層——少咗WhatsApp度問『搵邊個跟』。',
      '升級鏈到項目經理就係終點，唔會無限上呈——清晰嘅責任終點。',
      '全工地共享：判頭工人開嘅單，連業主、其他判頭、項目經理都即刻見到，做一份共同記錄，避免各自講各自。',
      '開單嗰刻角色會記低做快照，就算之後轉職位，舊單嘅升級路線都唔變。',
      '上呈只係改『邊個有權處理』，唔收窄『邊個睇得到』——全工地照樣睇到成條時間線。',
    ],
  },
  {
    key: 'si',
    title_zh: '工地指令 SI（Site Instruction）',
    route_or_location: '/project/:id/si（列表）+ /project/:id/si/:siId（詳情），SiList / SiDetail',
    what_it_does_zh:
      '把口頭工地指示變成有版本、有審批鏈、鎖定後不可改嘅正式記錄，作為日後爭議鐵證。預設簽核鏈係 總承建商 → 項目經理。每次修訂加新版本，舊版永久保留；最後一關批准後 SI 自動鎖定，鎖定後只可以加『抗議』備註。',
    roles_zh:
      '建立：系統管理員／項目經理／總承建商／判頭。審批：簽核鏈當前步驟嘅角色持有人（預設總承建商→項目經理），管理員可強制批准。唯讀：判頭工人、業主。睇得到：全工地已加入成員。',
    key_actions_zh: [
      '撳『新增工地指令』，系統自動派 SI-001 編號，建立草稿',
      '填內容並儲存做版本快照',
      '撳『提交』——簽核鏈定格、狀態轉審批中、推送第一關',
      '簽核人逐關『批准／連修訂批准／退回修訂／拒絕』',
      '最後一關批准後系統自動鎖定；鎖定後加『抗議』備註',
    ],
    demo_talking_points_zh: [
      '核心賣點：口頭指示→白紙黑字。判頭話『佢叫我做嘅』，SI 就係鐵證，連簽咗邊個、幾時簽都記低。',
      '版本不可改＋審批記錄只可加唔可改——批錯都刪唔到，正正係打官司同對數用。',
      '簽核鏈喺提交一刻凍結，之後改鏈唔影響已提交嘅 SI——避免事後改流程走數。',
      '鎖定＝終局，只可以加抗議備註，唔會推翻原文——保護證據完整性。',
      '可以延伸：一張鎖定咗嘅 SI 可以開出 VO（有價變更）。',
    ],
  },
  {
    key: 'vo',
    title_zh: '變更指令 VO（Variation Order）',
    route_or_location: '/project/:id/vo（列表）+ /project/:id/vo/:voId（詳情），VoList / VoDetail',
    what_it_does_zh:
      '就工程範圍或合約金額嘅有價變更，逐項列出加項／扣項估價（港幣），經審批鏈逐級批核、業主終批後鎖定，成為可追溯嘅合約變更紀錄。預設鏈係 總承建商 → 項目經理 → 業主（業主終批）。系統用『數量×單價』自動重算總額防止改數。',
    roles_zh:
      '建立／提交：系統管理員／項目經理／總承建商／判頭（只提交人本人可交）。審批：總承建商→項目經理→業主（終批），管理員可強制過關（須填10字原因）。唯讀：判頭工人。老總睇得到但冇『新增』掣。',
    key_actions_zh: [
      '開新 VO，可引用一張已鎖定 SI 或獨立建立，系統派 VO-001 編號',
      '加估價項目（類別／說明／數量／單位／單價，HKD），系統自動算小計同總額',
      '提交人本人撳『提交』，審批鏈定格',
      '總承建商→項目經理逐級批核（退回／拒絕須填10字以上原因）',
      '業主終批→狀態鎖定，全工地收『已鎖定』通知',
    ],
    demo_talking_points_zh: [
      'VO 係涉及錢嘅變更，所以審批鏈多一關業主終批——錢嘅嘢一定要業主拍板。',
      '金額由系統『數量×單價』話事，手填總額一律被覆蓋——防止有人填錯或偷改數。',
      '全工地透明：金額同批核軌跡公開可審計，連判頭、工人、業主都睇到批到邊一關。',
      'VO 可獨立建立（圖則修訂、口頭指示後補），唔一定要綁住 SI；一張 SI 亦可開多張 VO。',
      'HKD only——切合香港合約實務。',
    ],
  },
  {
    key: 'ptw',
    title_zh: '工作許可證 PTW（動火／高空／吊運 + QR 核實）',
    route_or_location:
      '/project/:id/ptw + /:ptwId（PtwList/PtwDetail），/verify/:token QR 核實；逐項目模組開關控制顯示',
    what_it_does_zh:
      '高風險工序開工前嘅電子許可證：建立草稿→提交簽核→安全主任／總承建商簽署→生效並出 QR 碼→（動火）等夠 30 分鐘火警監察→簽名完工關閉。現場掃 QR 即時核實真偽同有效期。PTW 預設冇審批鏈，要先喺簽核流程設定設好（建議 安全主任→總承建商）。',
    roles_zh:
      '建立／提交／完工：系統管理員／項目經理／總承建商／判頭（只建立人本人）。簽核：安全主任為關鍵把關關，按鏈設定。唯讀＋可掃QR核實：判頭工人、業主。掃QR要登入兼本項目已批准成員。',
    key_actions_zh: [
      '（一次性）喺簽核流程設定設好 PTW 審批鏈',
      '新增 PTW，揀工序類型（動火／高空／吊運），系統派 PTW-001',
      '填工序內容＋工人名單＋相片，提交簽核',
      '安全主任→總承建商逐關簽署批准',
      '生效後出 QR 碼，有效期到當晚 23:59（HK）；現場掃 QR 核實',
      '動火：開始30分鐘火警監察→簽名完工關閉；每日凌晨自動過期掃描',
    ],
    demo_talking_points_zh: [
      '切中香港地盤痛點：動火證、高空、吊運嘅法定許可，由紙本電子化。',
      'QR 碼現場核實係殺手鐧——工人掃一掃即刻知張證真定假、過唔過期，每次掃描記低做審計。',
      '動火嘅 30 分鐘火警監察強制執行：未夠30分鐘關唔到，杜絕走捷徑。',
      '安全主任係關鍵簽核關，連管理員都唔可以一鍵代批跳過——刻意保留安全把關。',
      '示範陷阱提醒：PTW 同 SI／VO 唔同，預設冇鏈，要先設好至提交得到——可以順帶帶出簽核流程設定。',
    ],
  },
  {
    key: 'approval-chain-config',
    title_zh: '簽核流程設定（每項目 SI／VO／PTW 簽核鏈）',
    route_or_location: '/admin/projects/:id/chains（AdminProjectChains），由項目管理入',
    what_it_does_zh:
      '為每個項目分別設定 SI／VO／PTW 嘅審批步驟順序同每步所需角色（可指定特定人）。SI 預設＝總承建商→項目經理；VO 預設＝總承建商→項目經理→業主；PTW 預設冇鏈要自己設好（建議安全主任→總承建商）。已提交文件凍結提交當刻嘅流程，之後改鏈唔影響。',
    roles_zh:
      '編輯三條鏈：系統管理員、本項目項目經理。其他成員（總承建商／判頭／老總／業主）：只可唯讀檢視（頁面顯示『唯讀模式』橫額）。執行簽核：嗰步所需角色嘅已批准成員。',
    key_actions_zh: [
      '揀 SI／VO／PTW 分頁，載入現有步驟',
      'PTW 撳『預設範本』載入建議鏈或自行加步驟（PTW 要先設好至提交得到）',
      '加／移除步驟、上下移調順序、每步揀所需角色（可指定特定成員）',
      '撳『儲存』寫入並重新排序',
      '之後提交新 SI／VO／PTW 時把當刻嘅鏈凍結入文件',
    ],
    demo_talking_points_zh: [
      '可配置審批鏈係企業級賣點——唔同工地、唔同合約可以有唔同把關流程。',
      '凍結機制係關鍵：改鏈唔追溯已提交文件，避免事後改流程走數——法律穩健。',
      'PTW 特別：預設冇鏈要人手設一次，否則提交出錯——示範時順帶解釋安全把關設計。',
      '可指定特定人 vs 所需角色——指定咗就只有嗰個人批得，否則該角色全部持有人都得，靈活。',
      'PTW 安全主任步驟唔接受管理員代批——刻意保留安全把關不可越過。',
    ],
  },
  {
    key: 'weather',
    title_zh: '天氣記錄 / 極端天氣 EOT（工期延誤索償）',
    route_or_location: '/project/:id/weather（WeatherRecord，由工具分頁入）+ 全程開住嘅實時天文台橫額（頁頂）',
    what_it_does_zh:
      '兩件事：（一）實時天文台惡劣天氣／停工橫額，掛喺工地頁頂嘅安全提示，由 HKO 公開數據自動嚟、全程開住唔關得；（二）極端天氣記錄同 EOT 申索——把八號風球、黑雨、24小時雨量超過20mm等惡劣天氣日記低，再就受影響日子申請延長工期，做政府／私人合約索償依據。',
    roles_zh:
      '記錄／編輯／匯出 EOT：系統管理員／被指派或已批准項目經理／總承建商／老總。唯讀（睇橫額＋天氣事件＋已記錄EOT）：判頭、判頭工人、安全主任、業主。實時橫額對任何已登入成員都顯示。',
    key_actions_zh: [
      '系統每約3分鐘更新頁頂實時天文台警告橫額（停工級轉紅）',
      '系統每約30分鐘由 HKO 公開數據抽全港惡劣天氣事件',
      '就惡劣天氣日撳『記錄此日』填觸發原因／關鍵路徑／可施工／善後日數／申請EOT日數',
      '頁頂跑住『已記錄申請 EOT 總日數』',
      '撳『匯出』出申索 CSV 交工程師／業主審',
    ],
    demo_talking_points_zh: [
      '香港工地一年好多打風落雨停工日——EOT 索償係實際合約錢，呢個功能把佢系統化。',
      '三層要分清：實時橫額（安全提示，全程開）、全港天氣事件（客觀公開記錄）、本工地 EOT 申索（你填嘅索償）。',
      '天氣事件由 HKO 自動入，唔使人手抄；但自動出現唔等於自動開咗EOT申索，要主動記錄此日。',
      '政府 GCC（酌情）同私人合約（客觀觸發）標準唔同——表內有關鍵路徑／可施工欄去說明，貼合實務。',
      'AI 站長都可以查天氣展望做預防提醒——同 assistant 模組聯動。',
    ],
  },
  {
    key: 'materials',
    title_zh: '物料申請 / 到貨',
    route_or_location: '/project/:id/materials（MaterialList），由工具分頁入',
    what_it_does_zh:
      '由判頭或總承建商等申請工地物料、填預計到貨時間、可連結進度項目；到貨時逐次記低入貨數量；狀態（已申請／部分到貨／已齊料）自動計算，逾期即時計，全項目成員可見。到貨日子自動上行事曆。',
    roles_zh:
      '開單：系統管理員／項目經理／總承建商／判頭。改／刪／入貨：開單人本人或物料主管（系統管理員／項目經理／老總）。唯讀：判頭工人、業主。睇得到：全項目已批准成員。',
    key_actions_zh: [
      '撳『加物料』填名、單位、需求量、預計到貨、可剔急件、可連結進度項目',
      '全項目成員睇清單，可按 全部／已申請／部分／已齊／逾期 篩選',
      '到貨時撳『入貨』輸入今次收到數量，累加',
      '齊料時系統自動標到貨時間、狀態跳『已齊料』',
      '申請人或物料主管編輯預計到貨／數量或刪除',
    ],
    demo_talking_points_zh: [
      '替代WhatsApp度問『啲料到咗未?』——一個清單睇晒每樣料嘅狀態。',
      '狀態係自動計：你只係一次次入貨累加，唔可以亂揀『已齊料』，杜絕填假。',
      '逾期紅標係即時計（已申請＋過咗預計到貨），逼住跟進。',
      '連結進度項目＋自動上行事曆——物料到貨同工序進度、時間表打通。',
      '權限清晰：判頭改唔到人哋開嘅料，只可以改自己嗰張（除非係物料主管）。',
    ],
  },
  {
    key: 'dailies',
    title_zh: '每日工地日誌',
    route_or_location: '/project/:id/daily（DailyList）+ /project/:id/daily/edit（DailyEdit）',
    what_it_does_zh:
      '由總承建商管工或工程師逐日記錄當日天氣、做咗嘅進度項目同工地事項。每人每日一份，全項目成員都睇到，做糾紛時嘅共同記錄。當日內可改／刪自己嗰份，過咗當日就永久鎖死。',
    roles_zh:
      '唯一可寫：總承建商管工或工程師（兼本項目已批准成員）。讀寫所有：系統管理員。只可睇：項目經理、老總／工地主任、判頭、判頭工人、業主、其他總承建商（如安全主任）。',
    key_actions_zh: [
      '撳右下『填寫今日日誌』浮動掣（只今日、有權限、未填過先見到）',
      '揀今日天氣（晴／陰／雨／暴雨／熱／凍／大風，必揀）',
      '搜尋並剔選今日做咗嘅進度細項',
      '加『其他事項』逐行輸入（吊機保養、安全會議等）同備註，儲存',
      '全項目成員揀日期睇當日所有人嘅日誌卡；今日卡可『編輯我嘅日誌』',
    ],
    demo_talking_points_zh: [
      '取代紙本工地日記——天氣、做咗咩、有咩事件，一份電子記錄，糾紛時拎得出。',
      '強調權限陷阱：老總／工地主任唔可以寫，只可以睇；判頭／工人都唔可以寫，要總承建商管工或工程師代填——介面有黃色提示講明。',
      '尋日日誌過咗就永久鎖死，唔可以倒填——保證日誌係當日真實記錄，係證據而唔係事後砌。',
      '每人每日一份，再開係編輯同一份，唔會重複。',
      '提醒：日誌嗰格天氣只係快速標籤，正式 EOT 證據要去天氣記錄模組——同 weather 區分。',
    ],
  },
  {
    key: 'timetable',
    title_zh: '統一行事曆',
    route_or_location: '/project/:id/timetable（TimetablePage），由工具分頁入',
    what_it_does_zh:
      '一個合併嘅時間表，自動拉物料嘅預計／實際到貨（藍）、進度項目嘅計劃完工日（綠），再加項目經理手動加嘅會議／驗收／里程碑事件（紫），全項目成員按週／月睇，三來源合併按時間排序。',
    roles_zh:
      '睇＋手動加事件：系統管理員、項目經理、老總／工地主任、總承建商。總承建商只可改／刪自己建立嗰個。唯讀：判頭、判頭工人、業主。睇得到：全項目已批准成員。',
    key_actions_zh: [
      '揀週／月範圍睇行事曆',
      '系統自動填入物料到貨（藍）、進度完工（綠，用計劃完工日）、手動事件（紫）',
      '撳『＋』新增手動事件，填標題、類型（會議／驗收／里程碑／其他）、時間、地點',
      '事件建立人或項目經理／系統管理員編輯或刪除',
    ],
    demo_talking_points_zh: [
      '一頁睇晒『幾時到料、幾時要做完、幾時開會驗收』——物料同進度自動拉入，唔使重複輸入。',
      '三色來源（物料藍／進度綠／手動紫）一眼分得清。',
      '進度事件用『計劃完工日』排，代表預計而非已完成——管理層提早睇到死線。',
      '同物料、進度模組打通——一個地方拉晒，唔使係幾個分頁之間跳。',
      '權限：唔俾判頭／工人亂加事件，保持行事曆乾淨。',
    ],
  },
  {
    key: 'contacts',
    title_zh: '聯絡人（工地電話簿）',
    route_or_location: '/project/:id/contacts（ContactList），由工具分頁入',
    what_it_does_zh:
      '每個項目嘅電話簿，記低分判／各行頭（電工、水喉、紮鐵、棚架等）嘅名、行頭同電話，方便工地即撳即打。聯絡人逐個項目獨立，唔係全公司共用通訊錄。',
    roles_zh:
      '新增／編輯／刪除：系統管理員、項目經理。睇、搜尋、撳電話打出：老總／工地主任、總承建商、判頭、判頭工人、業主（唯讀）。睇得到：全項目已批准成員。',
    key_actions_zh: [
      '撳『新增』填姓名、行頭、電話、備註',
      '用搜尋（名／行頭／電話）或行頭篩選搵聯絡人',
      '喺工地直接撳電話號碼打出',
      '系統管理員／項目經理編輯或刪除維護名單',
    ],
    demo_talking_points_zh: [
      '簡單但實用：地盤要即刻搵紮鐵判頭，唔使揭WhatsApp群——撳一下就打。',
      '全項目可見係刻意設計，方便現場任何人即撳即打，唔係權限漏洞。',
      '逐個項目獨立——唔同工地嘅分判唔會撈亂。',
      '維護權收窄到管理員／項目經理，避免名單被亂改。',
      '可以帶出：細功能但係日常高頻使用，提升整體黏性。',
    ],
  },
  {
    key: 'documents',
    title_zh: '文件 / 圖則版本管理（文件登記冊 + 圖則）',
    route_or_location:
      '/project/:id/files（ProjectFiles，route 後綴 files）+ /reviews 跨項目待審；逐項目模組開關控制顯示。另：圖則亦掛喺進度細項',
    what_it_does_zh:
      '文件登記冊嘅入口，同埋將圖則 PDF／相片掛喺最底層細項工序上嘅版本管理。每次上傳新版會自動把舊版標『已取代』，但舊版永遠保留做版本歷史同存證。檔案放私有儲存，經臨時連結開啟。',
    roles_zh:
      '上載新圖／新版本：系統管理員／項目經理／總承建商（明確唔包判頭，亦唔包老總／工地主任）。瀏覽：同項目任何已批准成員（連業主、判頭工人）。非本項目人士攞唔到臨時連結。',
    key_actions_zh: [
      '喺最底層細項『圖則』區撳『＋』開上傳介面（圖則只可掛最底層細項）',
      '揀檔案（PDF／JPEG／PNG）、填標題同修訂編號上傳',
      '之後撳『上傳新版本』：一個動作完成新版設現行＋舊版轉已取代',
      '撳縮圖經臨時連結檢視，或睇版本歷史',
      '（/reviews）跨項目睇待我審批嘅文件',
    ],
    demo_talking_points_zh: [
      '圖則版本混亂係地盤經典痛點——『邊張先係最新?』呢個功能一勞永逸。',
      '舊版唔會消失只係標『已取代』，圖則係不可刪嘅證據——用錯舊圖嘅爭議都查得返。',
      '檔案放私有儲存，唔係公開連結，非本項目人攞唔到——安全。',
      '圖則只可掛最底層細項工序——同進度樹聯動，邊個工序用邊張圖一目了然。',
      'Free tier 1GB 儲存壓力下，可帶出『壓縮上傳／大過5MB警告』嘅儲存預算考量。',
    ],
  },
  {
    key: 'equipment',
    title_zh: '機械 / 表格（器材登記 + 法定週期檢查 + QR）',
    route_or_location:
      '/project/:id/equipment + /:equipmentId（EquipmentList/EquipmentDetail）+ /equipment-verify/:token QR 核實',
    what_it_does_zh:
      '管理工地機械（棚架、挖掘工程、起重機械、吊船等）嘅登記冊，同掛喺機械上嘅法定週期檢查表格。合資格人士簽署檢查表（要本人持有已驗證、未過期、類型啱嘅資格證），系統計返有效期；可列印每件機械嘅 QR 碼，工人現場掃一掃核實狀態同去簽署。',
    roles_zh:
      '新增機械／加表格／列印QR／查驗資格證：系統管理員／被指派或已批准項目經理／總承建商／安全主任。簽署：任何持相符已驗證資格證嘅人（按資格證非管理權）。判頭／工人／業主：工具頁見唔到卡，靠掃QR入。',
    key_actions_zh: [
      '撳『新增機械』揀類別、填名，系統派 EQ-001 編號',
      '開機械→『加入表格』揀法定週期檢查表範本',
      '合資格人士『簽署』：逐項剔checklist、揀結果（合格／有備註／不合格）、簽名板簽名',
      '系統按範本週期計『有效至』，盡量出 A4 法定樣式 PDF',
      '列印機械 QR 貼上機械；工人掃 QR 核實狀態（未簽／到期／停用會出『去簽署』）',
    ],
    demo_talking_points_zh: [
      '香港法定週期檢查（吊船、起重機械等）必做——呢個把紙本表格電子化，連有效期都自動計。',
      '簽署係按『資格證』把關唔係按管理權——有資格證嘅工人簽得到，冇資格證嘅項目經理簽唔到（掣灰色講明原因），合規。',
      'QR 核實唔受模組開關影響（實體貼紙照用），工人現場掃即知部機過唔過期。',
      '『不合格』即時令張表停用並通知安全主任同項目經理——安全閉環。',
      '可帶出同『簽名證本人』聯動：簽署經二步驗證＋簽名前確認身份兩重閘。',
    ],
  },
  {
    key: 'assistant',
    title_zh: 'AI 站長 / 助理（含記憶圖譜）',
    route_or_location:
      'ProjectDetail 助理分頁（tabId=assistant）；要三閘全開：全域 ai_assistant_enabled + 本工地 ai_enabled + 助理模組',
    what_it_does_zh:
      '每個工地一個 AI 助手，喺助理分頁同你傾。可以幫你睇進度、行事曆、物料、問題、文件、聯絡人、天氣展望，仲識翻查工地嘅記憶筆記。叫佢落手改嘢（落單、收貨、開／回問題、改進度等）會先彈確認卡，撳『確認』先做。AI 只用你嘅身份去睇嘢，你睇唔到嘅佢都睇唔到。',
    roles_zh:
      '全部讀取＋全部改動工具（含批退文件、SI/VO/PTW審批決定）：系統管理員、項目經理、總承建商、老總。判頭：可落單／改進度／開問題等但唔包批退文件。判頭工人：開問題＋改自己百分比細項。業主：讀＋開回問題，物料／聯絡人／文件唯讀。',
    key_actions_zh: [
      '（一次性）系統管理員開齊三個掣（全域 AI、本工地 AI、助理模組）',
      '喺助理分頁打字問嘢（『邊啲工序落後?』『今日有咩物料到?』），AI 串流回覆',
      '讀取工具即場執行（用你身份，唔使確認）',
      '叫 AI 改動→彈確認卡（寫明摘要、風險、要改內容），撳『確認』先執行（可能要二步驗證）',
      'AI 用 recall_memory 翻查工地記憶圖譜筆記',
    ],
    demo_talking_points_zh: [
      '最大 wow factor：用粵語問『邊啲料未到、邊啲工序落後』，AI 即刻答——LIVE 行緊 moonshotai/kimi-k2。',
      '安全設計核心：AI 用你嘅身份（RLS），睇唔到你本身睇唔到嘅嘢——判頭問都只見自己嗰份，唔會洩漏。',
      '改動一定要確認卡＋雜湊核對先做，唔會自動亂改——人手最後把關。',
      '記憶圖譜：AI 記得工地嘅歷史筆記，跨對話翻查，唔係次次由零開始。',
      '判頭叫 AI 批文件會被拒（冇權連工具都唔開）——權限同手動操作完全一致。',
      '成本封頂：超出每日 AI 預算會暫時用唔到，第二日重設——Free tier 友善。',
    ],
  },
  {
    key: 'signature-proof',
    title_zh: '簽名證本人（簽署再驗證 + 簽核證明 + 二步驗證）',
    route_or_location:
      'SignReauthContext / StepUpContext（簽署時）、/security-setup（SecuritySetup TOTP enrolment）、Profile 上載資格證；PTW／表格詳情匯出簽核證明 PDF',
    what_it_does_zh:
      '兩件事：（一）簽名前確認身份——簽 PTW 或法定表格嗰一刻要再入一次登入密碼證明本人（俾勞工處等做非抵賴證據），呢個開關 sign_reauth_enforced 預設關，所以而家簽嘢同以前一樣唔彈密碼；（二）簽核證明——每張簽過嘅單都可攞一張證明書（誰／職位／憑證／何時簽／有冇竄改），可匯出 PDF，呢樣已用得。',
    roles_zh:
      '開／關簽名前確認身份強制：只限系統管理員。任何用戶：自己開二步驗證（TOTP）＋上載自己資格證。驗證成員資格證：系統管理員／項目經理／安全主任。查看／匯出簽核證明：任何可睇到該工地嘅成員。',
    key_actions_zh: [
      '（可選）管理員開『簽名前確認身份』強制（預設關）',
      '簽核人簽 PTW／法定表格時：（如開）先入6位數二步驗證碼，再（如開）入登入密碼',
      '系統由專用後台函數簽發5分鐘有效嘅簽署授權再寫入簽署',
      '喺 PTW／表格詳情撳『匯出簽名證明（PDF）』',
      '用戶喺 /security-setup 開二步驗證 TOTP；喺個人頁上載資格證俾人驗證',
    ],
    demo_talking_points_zh: [
      '非抵賴（non-repudiation）係法規賣點：證明邊個本人簽咗、幾時簽，唔可以事後抵賴——勞工處等認。',
      '兩重閘要分清：二步驗證（AAL2，6位數）vs 簽名前確認身份（新鮮密碼）——獨立可分別開關。',
      '誠實講現狀：sign_reauth_enforced 預設關，目前簽署無感；但簽核證明 PDF 已經用得，隨時拎得出。',
      '防竄改：簽核證明帶帳本雜湊鏈，證明記錄冇被改過。',
      '資格證閘：法定表格要本人持已驗證、未過期、類型啱嘅資格證先簽得到——合規閉環。',
    ],
  },
  {
    key: 'auth-phone-login',
    title_zh: '帳號註冊 / 登入（手機號 + 密碼）',
    route_or_location: '/login（Login）、/signup（Signup）；phone↔synthetic email 喺 src/lib/phone.ts + AuthContext',
    what_it_does_zh:
      '用 8 位香港手機號（5／6／7／9 開頭）加密碼開帳號同登入，唔使電郵。背後用 synthetic email（<digits>@phone.local）行 Supabase Auth 嘅電郵密碼流程，但用戶只見到手機號。開咗帳號只係有咗身份，仲未入到任何工地。',
    roles_zh:
      '未登入訪客：填姓名／手機號／密碼／揀職位開帳號（揀總承建商再揀工程師／管工／安全主任）。註冊頁冇『系統管理員』選項——管理員只可後台開或提升。',
    key_actions_zh: [
      '填姓名、8位香港手機號、密碼（最少6位）兼確認、揀職位、公司名',
      '撳『註冊』；系統查手機號有冇用過（用過提示『此手機號碼已註冊』）',
      '成功即時自動登入跳主頁',
      '下次喺登入頁輸入手機號＋密碼登入',
      '登入後讀身份／職位並綁定推送通知',
    ],
    demo_talking_points_zh: [
      '切合地盤師傅：唔使記電郵，淨係手機號＋密碼，最低門檻。',
      'Synthetic email 係實作技巧，用戶完全唔覺——保留 Supabase Auth 嘅成熟流程同 App Store 帳號刪除合規。',
      '登入錯誤永遠只寫『手機號或密碼錯誤』——刻意唔分開講，防止陌生人試出邊個手機號已註冊（防用戶枚舉）。',
      'Auth 模型鎖死：唔會加 magic link 或 SSO——呢個 milestone 專注簡單可靠。',
      '重點概念：開帳號 ≠ 入到工地，要再申請加入＋俾人批——自然帶出下一個功能。',
    ],
  },
  {
    key: 'apply-approve',
    title_zh: '申請加入工地 + 多層審核',
    route_or_location: 'Projects 頁（/projects，『申請加入工地』+『待審核申請』）；ProjectsContext applyToProject / approve',
    what_it_does_zh:
      '已開帳號用戶喺工地列表揀項目、揀自己喺嗰工地嘅職位，提交『待審核』申請。唔同身份由唔同審批人把關：項目經理批本工地成員，判頭批自己手下嘅判頭工人，系統管理員批所有。批咗先正式成為已批准成員，先解鎖工地內容。',
    roles_zh:
      '申請：任何已開帳號用戶（只用自己身份）。審批：系統管理員（所有）、項目經理（自己被指派工地）、判頭（只批本工地『判頭工人』）。申請人睇唔到審批掣，只見自己卡狀態變化。',
    key_actions_zh: [
      '撳『申請加入工地』揀項目＋揀自己嘅職位提交（系統防重複申請）',
      '審批人喺『待審核申請』睇到有權批嘅申請',
      '查申請人姓名／電話／公司核對身份（未載入好批准掣禁用）',
      '撳『批准』或『拒絕』，狀態變已加入／已拒絕並記低誰／何時批',
      '批准後申請人解鎖工地內容、成為其他隊友可見成員',
    ],
    demo_talking_points_zh: [
      '三層審批設計貼合判頭制：判頭管自己手下工人、項目經理管工地級成員、管理員兜底——權責清晰。',
      '見到工地名 ≠ 加入咗——任何人見到工地名只係方便揀邊個申請，真正入隊要審批。',
      '審批前要載入申請人資料核對身份，避免盲批——防陌生人混入。',
      '判頭只可以批判頭工人，批其他職位會被擋——示範權限邊界。',
      '批准係即時解鎖——申請人嗰邊用 realtime 即時由『待審核』變『已加入』，唔使重開 app。',
    ],
  },
  {
    key: 'project-zone-admin',
    title_zh: '項目管理（管理員開工地 + 分區 + 指派PM + 模組開關）',
    route_or_location:
      '/admin（AdminProjects）、/admin/projects/:id/chains（簽核流程）、/admin/projects/:id/modules（模組開關，AdminProjectModules）',
    what_it_does_zh:
      '系統管理員開立工地項目、設定分區、指派一個或多個項目經理、設定 SI/VO/PTW 簽核鏈、逐個項目開關 13 個模組（進度核心永遠開）、匯出項目 Excel、刪除工地。指派咗項目經理先有權審批呢個工地嘅成員。刪除係連鎖刪除（連進度／問題／文件），紅字警告。',
    roles_zh:
      '完整管理（開／刪工地、分區、指派PM、開關模組）：只限系統管理員。項目經理：唔可以開工地，只管理自己被指派嗰啲並憑此審批成員。任何登入者：只見工地名（方便申請）。',
    key_actions_zh: [
      '撳『新增工地項目』輸入工地名同分區',
      '喺工地卡『指派項目經理』揀人（名單由管理員專用名單提供）',
      '入『模組』頁逐個開關 12 個非核心模組（進度鎖住核心標籤）',
      '入『簽核流程設定』設 SI/VO/PTW 鏈',
      '匯出 Excel；刪除工地（紅字二次確認，連鎖刪除）',
    ],
    demo_talking_points_zh: [
      '管理員係系統嘅總控台——開盤、分區、派PM、開關功能全部喺呢度。',
      '模組開關係差異化賣點：同一個 app 可以按工地需要剪裁——細工地關晒PTW／天氣，大工地全開，唔會overwhelm用戶。',
      '進度永遠開（核心），其餘12個可關——背後 RLS 令關咗嘅模組成員攞到零行，唔係前端hide。',
      '指派PM 先解鎖PM權限——示範權限唔係靠帳號大角色，而係按項目成員身份。',
      '刪除係連鎖＋紅字警告——強調破壞性操作有保護，唔會手快delete晒。',
    ],
  },
  {
    key: 'dashboard',
    title_zh: '儀表板（跨項目總覽）',
    route_or_location: '/dashboard（Dashboard），ProtectedRoute 限管理員／項目經理',
    what_it_does_zh:
      '系統管理員同項目經理一頁睇晒自己負責嘅多個工地總覽——工地總數、進度正常／落後、處理中問題，加上跨項目最近動態（新問題、進度更新、入隊申請）。其他角色入唔到，會被帶返主頁。',
    roles_zh:
      '系統管理員：睇晒所有項目嘅進度滾算、問題統計同動態。項目經理：只睇到自己被指派嘅工地。其他角色（含老總、總承建商、判頭、業主、工人）：入唔到，被帶返主頁。',
    key_actions_zh: [
      '登入後入『儀表板』，系統計出可見工地',
      '一次過抓呢批工地嘅進度同問題，每個工地自動計實際／計劃進度同狀態',
      '右側顯示最近 15 條跨項目動態，左側顯示每工地進度條＋狀態標籤',
      '撳某個工地卡或動態跳去詳情或對應問題頁',
    ],
    demo_talking_points_zh: [
      '判頭／工地主任視角：一眼睇晒幾個盤邊個落後、邊個有未處理問題——唔使逐個工地入去check。',
      '進度落後用排程日期推算『今日應做到幾多%』，實際低過5%先當落後，唔係同100%比。',
      '項目經理只睇自己被指派工地，系統管理員睇全部——背後資料仍受RLS保護，前端被繞過都抓唔到唔屬於佢嘅。',
      '動態唔係另查一個表，係由已抓嘅問題／成員／進度即場整理——高效。',
      '可帶出陷阱：關咗某工地『問題』模組，個工地問題唔計入跨項目統計（儀表板冇標示模組關咗）。',
    ],
  },
  {
    key: 'report-export',
    title_zh: '進度報告匯出（業主版 / 內部版 / 例外版）',
    route_or_location: 'ProjectDetail 進度分頁右上下載圖示→『匯出進度報告』；src/lib/export.ts（xlsx + jspdf）',
    what_it_does_zh:
      '將工地進度一鍵匯出成 PDF 或 Excel：業主版係一頁紙白話總覽、內部版多埋每區逐項細表、例外版只睇延誤同落後，仲會自動計『本期變化』同寫一句白話總結，方便直接 WhatsApp send 畀老闆或業主。匯出時記低本期快照做下次比較基準。',
    roles_zh:
      '可開匯出視窗出 PDF／Excel：任何開到進度分頁嘅已批准成員（含工人、業主）。但份報告只含匯出者本身睇得到嘅進度行。只有編輯角色（管理員／項目經理／總承建商／判頭）匯出先更新『本期變化』基準。',
    key_actions_zh: [
      '進度分頁撳下載圖示→『匯出進度報告…』',
      '揀範本：業主版（一頁紙）／內部版（一頁紙＋每區詳細）／例外版（只延誤＋落後）',
      '（選填）進階設定揀分區／層級深度／狀態／報告期數',
      '撳『匯出 Excel』或『匯出 PDF』，系統抓上期快照計本期變化＋白話總結',
      '原生 App 彈分享視窗（WhatsApp／電郵）；網頁直接分享或下載',
    ],
    demo_talking_points_zh: [
      '業主版一頁紙係殺手鐧：業主唔使識用 app，項目經理一撳就出張 10 秒睇得明嘅報告 send 過去。',
      '三種範本切合場景：業主版（對外）／內部版（追數）／例外版（只睇紅嘅）。',
      '自動算『本期 +X%』同白話總結句——唔使人手寫進度報告，慳時間。',
      '權限細節：工人／業主都撳到匯出，但份報告只有佢權限內嘅行，睇唔到嘅項目根本唔出現——唔會洩漏。',
      '原生 App 直接彈分享而唔係靜靜存檔——切合『即刻 WhatsApp send 老闆』嘅實際用法。',
    ],
  },
  {
    key: 'offline-cache',
    title_zh: '離線唯讀快取',
    route_or_location: '全 app 層；isOnline 真相（原生用 Capacitor 網絡偵測）+ 各 context 本機快取 + 頁頂離線橫額',
    what_it_does_zh:
      '斷網時 App 入唯讀模式：用最後一次同步嘅本機快取繼續顯示資料，但任何寫入（新增／修改／上傳）會喺打網絡前就被攔截並彈一句清楚嘅中文提示，唔會狂轉圈。離線寫入刻意唔排隊，連線後要自己重做。',
    roles_zh:
      '所有角色：離線時繼續睇返最後同步資料（唯讀），嘗試寫入即時被擋並提示要連線。系統：離線時攔截各種寫入同上傳，回一句清楚嘅離線提示。',
    key_actions_zh: [
      'App 啟動偵測連線（原生額外用 Capacitor 更可靠）',
      '正常連線時各頁面把最新資料寫入本機快取',
      '斷網後抓資料失敗→改用本機快取顯示最後同步資料，頂部顯示離線橫額',
      '離線時嘗試寫入→喺打網絡前攔截，回『離線中：此操作需要網絡連線，請連線後再試。』',
    ],
    demo_talking_points_zh: [
      '地盤訊號差好常見——離線仲睇得返最後同步嘅進度／圖則，唔會白屏。',
      'Option A 設計：唯讀快取，唔係寫入隊列——離線寫入刻意唔排隊，避免衝突同假成功。',
      '清楚中文提示『需要網絡連線』而唔係狂轉圈——UX 誠實。',
      '快取只係你上次合法攞到嘅資料，唔會洩漏你本身睇唔到嘅嘢——安全。',
      'iOS 有時報錯誤『在線』，所以原生用更可靠嘅 Capacitor 網絡偵測。',
    ],
  },
  {
    key: 'push-notifications',
    title_zh: '推送通知（OneSignal，每日限額防滋擾）',
    route_or_location: '原生 App；src/lib/push.ts（Capacitor push → OneSignal players）+ supabase/v5-split/ DB 觸發器',
    what_it_does_zh:
      '原生 App 會喺簽核事件（SI 提交、輪到你批、流程完成等）只推俾相關人，並設每人每日 3 條上限防滋擾，超額嘅留到第二朝 08:00 一次過摘要送出。推送帶直達連結。網頁版唔註冊推送。',
    roles_zh:
      '所有原生 App 用戶：登入時被詢問推送權限，授權後收同自己有關嘅推送，登出時清走自己嘅推送綁定。系統：唯一合法發送者，按事件鎖定目標人，維護每日計數。網頁版用戶：唔收原生推送。',
    key_actions_zh: [
      '用戶登入→系統請求推送權限→攞到推送 token',
      '把 token 同帳號綁定（iOS device_type=0／Android device_type=1 分開記）',
      '事件觸發（如總承建商提交 SI、輪到項目經理批）→系統揀出要通知嘅人',
      '3 條以內即時推送（含直達連結）；第 4 條起留到第二朝 08:00 摘要',
      '登出時 pushLogoutUser() 先清走 onesignal_id 再 signOut',
    ],
    demo_talking_points_zh: [
      '只推俾相關人＋每日3條上限——刻意唔spam，OneSignal Free tier 友善，用戶唔會關通知。',
      '超額留到第二朝 08:00 一次過摘要——尊重作息又唔漏資料。',
      '推送帶直達連結（#/...），撳一下直接跳去嗰份文件——順暢。',
      '登出順序重要：先清推送綁定再 signOut，需要live session 先清得到 onesignal_id。',
      'DB 觸發器 fan out——通知由 Supabase 後端發，唔靠前端，可靠。',
    ],
  },
  {
    key: 'account-deletion',
    title_zh: '刪除帳號（App Store 合規自助刪除）',
    route_or_location: 'Profile 頁（/profile）紅色『刪除帳號』掣；supabase/v6-account-deletion.sql',
    what_it_does_zh:
      '用戶可以喺『我的』頁面自己永久刪除帳號，唔使搵客服。刪除即時登出、移走個人資料同推送訂閱；但之前建立過嘅工程記錄（工序、問題、簽核等）會保留作審計，作者欄變『已移除』。如仲有未處理嘅簽核工作，要等管理員重新分派先刪得到。',
    roles_zh:
      '任何已登入用戶：都可以自己刪自己帳號（App Store 硬性要求）。系統管理員：唔需代刪，但如用戶有未完成簽核擋住，管理員重新分派俾其他人。其他人：睇唔到亦控制唔到你刪唔刪。',
    key_actions_zh: [
      '入『我的』頁面拉到底撳紅色『刪除帳號』',
      '確認視窗列明四點後果（帳號永久刪、即時登出、推送解除、工程記錄保留作者變已移除）',
      '撳『確認刪除』——冇未處理簽核就即刻永久刪除',
      '（如有未處理簽核）系統擋住並提示『需要管理員重新分派』',
      '撳『通知管理員』，待重新分派後再刪',
    ],
    demo_talking_points_zh: [
      'App Store 合規重點：用戶必須可以自助刪帳號，唔使打電話寫信——呢個已過審。',
      '刪帳號 ≠ 刪記錄：工程記錄係糾紛時嘅共同證據，作者變『已移除』但記錄保留——平衡私隱同審計。',
      '簽核守門：有未處理簽核會擋住刪除，避免簽核鏈中途斷死——周到。',
      '只刪自己登入身份名下嘅嘢，無人可借呢個功能刪別人——安全。',
      '操作無法復原，同一手機號登入唔返——清楚警告。',
      '新角色 safety_officer 一樣繼承account-deletion——任何新角色都要守呢個合規。',
    ],
  },
]

// ── section grouping (7 sections, all 23 keys) ──
type SectionDef = {
  id: string
  title: string
  blurb: string
  keys: string[]
}

const SECTIONS: SectionDef[] = [
  {
    id: 'auth',
    title: '登入與權限',
    blurb: '開帳號 → 申請入工地 → 俾人批准，先見得到工地內容。',
    keys: ['auth-phone-login', 'apply-approve'],
  },
  {
    id: 'progress',
    title: '進度',
    blurb: '三層工序樹自動加總、問題升級鏈、跨項目儀表板。',
    keys: ['progress', 'issues', 'dashboard'],
  },
  {
    id: 'signoff',
    title: '簽核（SI / VO / PTW）',
    blurb: '口頭指示變鐵證：工地指令、變更指令、工作許可證 + 可配置簽核鏈。',
    keys: ['si', 'vo', 'ptw', 'approval-chain-config'],
  },
  {
    id: 'tools',
    title: '現場工具',
    blurb: '天氣 EOT、物料到貨、每日日誌、行事曆、聯絡人、文件圖則、機械表格。',
    keys: ['weather', 'materials', 'dailies', 'timetable', 'contacts', 'documents', 'equipment'],
  },
  {
    id: 'ai',
    title: 'AI 站長與記憶',
    blurb: '用粵語問進度／物料／天氣，AI 用你身份睇嘢、改動要確認卡。',
    keys: ['assistant'],
  },
  {
    id: 'security',
    title: '簽名證本人',
    blurb: '簽核要密碼重新認證，配 get_signature_proof 證書 — 簽咗就賴唔甩。',
    keys: ['signature-proof'],
  },
  {
    id: 'admin',
    title: '管理與匯出',
    blurb: '管理員開工地、派PM、開關模組；一鍵匯出業主版／內部版報告。',
    keys: ['project-zone-admin', 'report-export'],
  },
  // Platform plumbing — these are GUARANTEES the app stands on, not headline
  // features. Demoted to the end so the value modules above lead the demo.
  {
    id: 'platform',
    title: '平台保證（底層）',
    blurb: '底層保障，平時睇唔到但一直喺度：離線唯讀、推送限額、App Store 合規刪帳號。',
    keys: ['offline-cache', 'push-notifications', 'account-deletion'],
  },
]

// Per-function icon (in-app safety-50 tile style).
const ICONS: Record<string, typeof ListChecks> = {
  progress: ListChecks,
  issues: AlertCircle,
  dashboard: LayoutDashboard,
  si: FileText,
  vo: FileCheck2,
  ptw: ShieldCheck,
  'approval-chain-config': Settings2,
  weather: CloudRain,
  materials: Package,
  dailies: BookOpen,
  timetable: CalendarDays,
  contacts: ContactIcon,
  documents: ImageIcon,
  equipment: Wrench,
  assistant: Bot,
  'signature-proof': FileSignature,
  'offline-cache': WifiOff,
  'push-notifications': BellRing,
  'account-deletion': Trash2,
  'auth-phone-login': KeyRound,
  'apply-approve': UserCheck,
  'project-zone-admin': Settings2,
  'report-export': FileDown,
}

// The 4 live [DEMO] projects with their baseline progress-item counts.
const DEMO_PROJECTS = [
  { name: '大地盤', id: 'd0000001-0001-0001-0001-000000000001', count: 50 },
  { name: '裝修', id: 'd0000002-0002-0002-0002-000000000002', count: 33 },
  { name: '渠務', id: 'd0000003-0003-0003-0003-000000000003', count: 25 },
  { name: '維修', id: 'd0000004-0004-0004-0004-000000000004', count: 26 },
]

const BY_KEY: Record<string, FnEntry> = Object.fromEntries(INVENTORY.map(e => [e.key, e]))

export default function Demo() {
  const [query, setQuery] = useState('')
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({})

  const q = query.trim()
  const matches = useMemo(() => {
    if (!q) return null
    return new Set(
      INVENTORY.filter(
        e =>
          e.title_zh.includes(q) ||
          e.what_it_does_zh.includes(q) ||
          e.roles_zh.includes(q) ||
          e.key.includes(q),
      ).map(e => e.key),
    )
  }, [q])

  function toggle(key: string) {
    setOpenKeys(s => ({ ...s, [key]: !s[key] }))
  }

  const visibleSections = SECTIONS.map(s => ({
    ...s,
    entries: s.keys.map(k => BY_KEY[k]).filter((e): e is FnEntry => !!e && (!matches || matches.has(e.key))),
  })).filter(s => s.entries.length > 0)

  const totalShown = visibleSections.reduce((n, s) => n + s.entries.length, 0)

  return (
    <div className="min-h-screen bg-site-50 text-site-900 font-sans antialiased">
      {/* ── HERO ── */}
      <header className="bg-site-950 text-white">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-14">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-lg bg-safety-500 text-white grid place-items-center font-heading font-extrabold">CK</div>
            <span className="font-heading font-bold tracking-tight">CK工程</span>
          </div>
          <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-widest text-safety-400 bg-safety-500/10 ring-1 ring-safety-500/30 rounded-full px-3 py-1.5 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-safety-400 animate-pulse" />
            示範總覽 · {INVENTORY.length} 個功能
          </div>
          <h1 className="font-heading text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.1]">
            CK工程 <span className="text-safety-500">功能總覽</span>
          </h1>
          <p className="mt-4 text-sm md:text-base text-site-300 leading-relaxed max-w-2xl">
            一頁睇晒成個系統嘅 {INVENTORY.length} 個功能——每個功能都有「邊個做、點流轉、邊個睇到」同一個橙色
            <span className="text-white font-medium">「講解」</span>框，方便 demo 時逐個講。撳卡可以展開詳情。
          </p>
        </div>
      </header>

      {/* hazard rule */}
      <div className="h-1.5 w-full" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #f97316 0 14px, #0f172a 14px 28px)' }} />

      <main className="max-w-5xl mx-auto px-5 md:px-8 py-8 md:py-10">
        {/* ── DEMO projects table ── */}
        <section className="card p-5 md:p-6 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-white bg-safety-500 px-1.5 py-0.5 rounded">DEMO</span>
            <h2 className="font-heading font-bold text-lg text-site-900">4 個示範工地（live 例子）</h2>
          </div>
          <p className="text-sm text-site-500 mb-4">
            示範用嘅 4 個 [DEMO] 工地，每個都有齊全部 13 個模組嘅 baseline 資料，進度細項數如下。
          </p>
          <div className="overflow-x-auto rounded-xl border border-site-200">
            <table className="w-full text-sm min-w-[460px]">
              <thead>
                <tr className="text-left bg-site-50">
                  <th className="py-3 px-4 font-semibold text-site-500">工地類型</th>
                  <th className="py-3 px-4 font-semibold text-site-500">項目 ID</th>
                  <th className="py-3 px-4 font-semibold text-site-500 text-right">進度細項數</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_PROJECTS.map((p, i) => (
                  <tr key={p.id} className={`border-t border-site-100 ${i % 2 ? 'bg-site-50/40' : ''}`}>
                    <td className="py-3 px-4 font-semibold text-site-800">
                      <span className="text-safety-600">[DEMO]</span> {p.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-site-500">{p.id}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-site-800 tabular-nums">{p.count}</td>
                  </tr>
                ))}
                <tr className="border-t border-site-200 bg-site-950 text-white">
                  <td className="py-3 px-4 font-bold" colSpan={2}>合計</td>
                  <td className="py-3 px-4 text-right font-heading font-extrabold text-safety-500 tabular-nums">
                    {DEMO_PROJECTS.reduce((n, p) => n + p.count, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Search + jump nav ── */}
        <div className="sticky top-0 z-20 -mx-5 md:-mx-8 px-5 md:px-8 py-3 bg-site-50/90 backdrop-blur-sm border-b border-site-200 mb-6">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜尋功能（名稱／角色／關鍵字）…"
              className="input pl-9 py-2"
            />
          </div>
          {!q && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {SECTIONS.map(s => (
                <a
                  key={s.id}
                  href={`#sec-${s.id}`}
                  className="text-xs font-semibold rounded-full px-3 py-1.5 bg-white text-site-600 border border-site-200 hover:border-safety-300 hover:text-safety-600 transition whitespace-nowrap min-h-0"
                >
                  {s.title}
                </a>
              ))}
            </div>
          )}
          {q && (
            <p className="text-xs text-site-500 mt-2">搵到 {totalShown} 個功能</p>
          )}
        </div>

        {/* ── Sections ── */}
        {visibleSections.length === 0 && (
          <p className="text-sm text-site-400 text-center py-12">冇符合嘅功能</p>
        )}
        <div className="space-y-10">
          {visibleSections.map((s, si) => (
            <section key={s.id} id={`sec-${s.id}`} className="scroll-mt-28">
              <div className="flex items-baseline gap-2.5 mb-1">
                <span className="font-mono text-xs font-bold text-safety-500 tracking-widest">
                  {String(si + 1).padStart(2, '0')}
                </span>
                <h2 className="font-heading font-extrabold text-xl md:text-2xl text-site-900">{s.title}</h2>
                <span className="text-xs font-mono text-site-400">{s.entries.length} 項</span>
              </div>
              <p className="text-sm text-site-500 mb-4">{s.blurb}</p>
              <div className="space-y-3">
                {s.entries.map(e => (
                  <FunctionCard
                    key={e.key}
                    entry={e}
                    open={!!q || !!openKeys[e.key]}
                    onToggle={() => toggle(e.key)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* footer */}
        <div className="mt-12 pt-6 border-t border-site-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-site-400">
          <span>CK工程 / Construction App · 功能總覽（示範用）</span>
          <Link to="/sell" className="font-mono text-xs hover:text-safety-600 transition">
            → 銷售頁 /sell
          </Link>
        </div>
      </main>
    </div>
  )
}

function FunctionCard({ entry, open, onToggle }: { entry: FnEntry; open: boolean; onToggle: () => void }) {
  const Icon = ICONS[entry.key] ?? ListChecks
  return (
    <div className="card p-0 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-site-50 transition"
      >
        <div className="w-9 h-9 rounded-lg bg-safety-50 text-safety-600 grid place-items-center flex-shrink-0">
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-site-900 text-sm leading-snug">{entry.title_zh}</p>
          <p className="text-xs font-mono text-site-400 truncate mt-0.5">{entry.route_or_location}</p>
        </div>
        {open ? (
          <ChevronDown size={18} className="text-site-400 flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronRight size={18} className="text-site-400 flex-shrink-0 mt-0.5" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-site-100 space-y-4">
          {/* what it does */}
          <p className="text-sm text-site-700 leading-relaxed">{entry.what_it_does_zh}</p>

          {/* roles */}
          <div className="rounded-xl bg-site-50 border border-site-200 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-site-400 mb-1">角色／權限</div>
            <p className="text-xs text-site-600 leading-relaxed">{entry.roles_zh}</p>
          </div>

          {/* key actions */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-site-400 mb-1.5">主要操作</div>
            <ul className="space-y-1.5">
              {entry.key_actions_zh.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-site-700 leading-relaxed">
                  <span className="font-mono font-bold text-safety-500 flex-shrink-0">{i + 1}.</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* talking points — highlighted 講解 box */}
          <div className="rounded-xl bg-safety-50 border border-safety-100 p-3.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Megaphone size={14} className="text-safety-600" />
              <span className="text-xs font-bold text-safety-700">講解（demo 時可以咁講）</span>
            </div>
            <ul className="space-y-1.5">
              {entry.demo_talking_points_zh.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-site-700 leading-relaxed">
                  <span className="text-safety-500 flex-shrink-0 mt-0.5">▸</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
