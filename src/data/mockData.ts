import type {
  Zone, SCurvePoint, DailyReport, Drawing, PTW,
  SafetyObservation, NearMissReport, Worker, Material,
  Task, Notification, Milestone, Issue, IncidentTrendPoint,
  ProgressItem, SiteMessage
} from '../types'

export const project = {
  name: 'Kwan Chun Kit Limited Company',
  nameEn: 'Victoria Harbour New Shore Complex',
  location: '西九龍填海區 Lot 8',
  startDate: '2024-03-01',
  endDate: '2026-02-28',
  totalBudget: 850_000_000,
  spentBudget: 527_000_000,
  client: '九龍發展局',
  contractor: 'Kwan Chun Kit Limited Company',
  currentProgress: 62,
  plannedProgress: 68,
  totalFloors: 42,
  totalArea: 85000,
  safetyDaysWithoutIncident: 47,
}

export const zones: Zone[] = [
  { id: 'A', name: 'Zone A — 地基及地下室', nameEn: 'Foundation & Basement', progress: 100, planned: 100, status: 'completed', lead: '陳工程師' },
  { id: 'B', name: 'Zone B — 核心筒結構', nameEn: 'Core Wall Structure', progress: 88, planned: 90, status: 'on-track', lead: '李工程師' },
  { id: 'C', name: 'Zone C — 主樓結構', nameEn: 'Main Tower Structure', progress: 72, planned: 78, status: 'behind', lead: '張工程師' },
  { id: 'D', name: 'Zone D — 幕牆及外飾', nameEn: 'Curtain Wall & Facade', progress: 45, planned: 55, status: 'behind', lead: '王工程師' },
  { id: 'E', name: 'Zone E — 機電工程', nameEn: 'M&E Services', progress: 38, planned: 40, status: 'on-track', lead: '劉工程師' },
  { id: 'F', name: 'Zone F — 室內裝修', nameEn: 'Interior Fit-out', progress: 18, planned: 25, status: 'critical', lead: '黃工程師' },
  { id: 'G', name: 'Zone G — 外部工程', nameEn: 'External Works', progress: 12, planned: 15, status: 'on-track', lead: '林工程師' },
  { id: 'H', name: 'Zone H — 系統調試', nameEn: 'Commissioning', progress: 3, planned: 5, status: 'on-track', lead: '陳工程師' },
]

export const sCurveData: SCurvePoint[] = [
  { month: 'M1',  planned: 2,    actual: 1.8 },
  { month: 'M2',  planned: 5,    actual: 4.5 },
  { month: 'M3',  planned: 9,    actual: 8.2 },
  { month: 'M4',  planned: 14,   actual: 13.1 },
  { month: 'M5',  planned: 20,   actual: 18.4 },
  { month: 'M6',  planned: 28,   actual: 26.0 },
  { month: 'M7',  planned: 36,   actual: 33.5 },
  { month: 'M8',  planned: 44,   actual: 41.2 },
  { month: 'M9',  planned: 52,   actual: 48.8 },
  { month: 'M10', planned: 58,   actual: 54.3 },
  { month: 'M11', planned: 63,   actual: 58.7 },
  { month: 'M12', planned: 66,   actual: 61.5 },
  { month: 'M13', planned: 68,   actual: 62.0 },
  { month: 'M14', planned: 70,   actual: null },
  { month: 'M15', planned: 73,   actual: null },
  { month: 'M16', planned: 76,   actual: null },
  { month: 'M17', planned: 80,   actual: null },
  { month: 'M18', planned: 84,   actual: null },
  { month: 'M19', planned: 88,   actual: null },
  { month: 'M20', planned: 91,   actual: null },
  { month: 'M21', planned: 94,   actual: null },
  { month: 'M22', planned: 96.5, actual: null },
  { month: 'M23', planned: 98.5, actual: null },
  { month: 'M24', planned: 100,  actual: null },
]

export const dailyReports: DailyReport[] = [
  { id: 'DR014', date: '2026-04-14', zone: 'Zone C', author: '張工程師', manpower: 87, summary: '完成 28-30/F 樓板混凝土澆築，共 180m³；29/F 柱鋼筋綁紮完成 70%。', weatherCode: '☀️', status: 'pending', issues: 1 },
  { id: 'DR013', date: '2026-04-13', zone: 'Zone D', author: '王工程師', manpower: 52, summary: '20-22/F 幕牆玻璃安裝完成 18 塊；鋁框收口工序進行中。', weatherCode: '⛅', status: 'submitted', issues: 0 },
  { id: 'DR012', date: '2026-04-12', zone: 'Zone E', author: '劉工程師', manpower: 64, summary: '15-18/F 主電纜鋪設完成；冷凍機房設備吊裝準備工作進行中。', weatherCode: '🌧️', status: 'approved', issues: 2 },
  { id: 'DR011', date: '2026-04-11', zone: 'Zone C', author: '張工程師', manpower: 91, summary: '27/F 核心筒混凝土完成；28/F 模板安裝進行中，預計明日完成。', weatherCode: '☀️', status: 'approved', issues: 0 },
  { id: 'DR010', date: '2026-04-10', zone: 'Zone F', author: '黃工程師', manpower: 38, summary: '5/F 辦公室輕鋼龍骨安裝完成；天花板石膏板開始施工。', weatherCode: '☀️', status: 'approved', issues: 1 },
  { id: 'DR009', date: '2026-04-09', zone: 'Zone B', author: '李工程師', manpower: 45, summary: '核心筒 31/F 完成澆築；電梯槽鋼筋綁紮驗收通過。', weatherCode: '⛅', status: 'approved', issues: 0 },
  { id: 'DR008', date: '2026-04-08', zone: 'Zone G', author: '林工程師', manpower: 29, summary: '北側臨時圍欄更換完成；地面排水渠開挖 60m。', weatherCode: '⛅', status: 'approved', issues: 0 },
]

export const drawings: Drawing[] = [
  { id: 'DWG001', drawingNo: 'STR-C-28-001', title: '28-30/F 樓板配筋圖', revision: 'Rev.C', uploadDate: '2026-04-10', uploadedBy: '張工程師', zone: 'Zone C', discipline: 'structural', status: 'current' },
  { id: 'DWG002', drawingNo: 'STR-C-28-001', title: '28-30/F 樓板配筋圖', revision: 'Rev.B', uploadDate: '2026-03-18', uploadedBy: '張工程師', zone: 'Zone C', discipline: 'structural', status: 'superseded' },
  { id: 'DWG003', drawingNo: 'ARC-D-20-005', title: '20-25/F 幕牆立面圖', revision: 'Rev.A', uploadDate: '2026-04-08', uploadedBy: '王工程師', zone: 'Zone D', discipline: 'architectural', status: 'current' },
  { id: 'DWG004', drawingNo: 'MEP-E-15-012', title: '15/F 機電佈置圖', revision: 'Rev.D', uploadDate: '2026-04-12', uploadedBy: '劉工程師', zone: 'Zone E', discipline: 'mep', status: 'current' },
  { id: 'DWG005', drawingNo: 'STR-B-31-002', title: '31/F 核心筒平面圖', revision: 'Rev.B', uploadDate: '2026-04-05', uploadedBy: '李工程師', zone: 'Zone B', discipline: 'structural', status: 'under-review' },
  { id: 'DWG006', drawingNo: 'ARC-F-05-001', title: '5/F 辦公室室內設計圖', revision: 'Rev.A', uploadDate: '2026-03-28', uploadedBy: '黃工程師', zone: 'Zone F', discipline: 'architectural', status: 'current' },
  { id: 'DWG007', drawingNo: 'CIV-G-EXT-003', title: '外部排水工程圖', revision: 'Rev.C', uploadDate: '2026-04-01', uploadedBy: '林工程師', zone: 'Zone G', discipline: 'civil', status: 'current' },
  { id: 'DWG008', drawingNo: 'STR-C-31-001', title: '31/F 柱配筋詳圖', revision: 'Rev.A', uploadDate: '2026-04-13', uploadedBy: '張工程師', zone: 'Zone C', discipline: 'structural', status: 'under-review' },
]

export const ptws: PTW[] = [
  {
    id: 'PTW-2026-041',
    ptwNo: 'PTW-2026-041',
    workType: '高空作業 — 吊籠安裝',
    location: 'Zone D, 22/F 北幕牆',
    applicant: '麥工頭',
    startTime: '2026-04-14 07:30',
    endTime: '2026-04-14 18:00',
    riskLevel: 'high',
    status: 'pending',
    hazards: ['高空墜落', '吊裝碰撞', '強風影響'],
  },
  {
    id: 'PTW-2026-040',
    ptwNo: 'PTW-2026-040',
    workType: '電焊作業 — 鋼骨連接',
    location: 'Zone C, 28/F',
    applicant: '陳工頭',
    startTime: '2026-04-14 08:00',
    endTime: '2026-04-14 17:00',
    riskLevel: 'medium',
    status: 'active',
    hazards: ['火花飛濺', '煙霧吸入', '電氣危險'],
  },
  {
    id: 'PTW-2026-039',
    ptwNo: 'PTW-2026-039',
    workType: '密閉空間作業 — 地下水箱',
    location: 'B2/F 水泵房',
    applicant: '李工頭',
    startTime: '2026-04-13 09:00',
    endTime: '2026-04-13 16:00',
    riskLevel: 'high',
    status: 'completed',
    hazards: ['缺氧', '有毒氣體', '溺水'],
  },
  {
    id: 'PTW-2026-038',
    ptwNo: 'PTW-2026-038',
    workType: '混凝土澆築 — 樓板',
    location: 'Zone C, 27/F',
    applicant: '陳工頭',
    startTime: '2026-04-11 06:00',
    endTime: '2026-04-11 20:00',
    riskLevel: 'medium',
    status: 'completed',
    hazards: ['滑倒', '重物擠壓', '噪音'],
  },
  {
    id: 'PTW-2026-037',
    ptwNo: 'PTW-2026-037',
    workType: '挖掘作業 — 外部排水渠',
    location: 'Zone G, 地面層',
    applicant: '鄭工頭',
    startTime: '2026-04-14 07:00',
    endTime: '2026-04-14 16:00',
    riskLevel: 'low',
    status: 'active',
    hazards: ['泥土塌陷', '地下管線'],
  },
]

export const safetyObservations: SafetyObservation[] = [
  { id: 'SO-001', date: '2026-04-14', inspector: '陳安全主任', zone: 'Zone C', category: '個人防護裝備', finding: '發現 2 名工人未有正確佩戴安全帽', severity: 'medium', status: 'open' },
  { id: 'SO-002', date: '2026-04-13', inspector: '陳安全主任', zone: 'Zone D', category: '工作平台', finding: '22/F 吊籠圍欄有鬆脫情況，需即時維修', severity: 'high', status: 'in-progress' },
  { id: 'SO-003', date: '2026-04-12', inspector: '陳安全主任', zone: 'Zone E', category: '電氣安全', finding: '臨時電箱門未關閉，存在觸電風險', severity: 'high', status: 'closed' },
  { id: 'SO-004', date: '2026-04-11', inspector: '陳安全主任', zone: 'Zone G', category: '工地整潔', finding: '外部工程區散落建築廢料，阻礙通道', severity: 'low', status: 'closed' },
  { id: 'SO-005', date: '2026-04-10', inspector: '陳安全主任', zone: 'Zone F', category: '消防安全', finding: '5/F 裝修區滅火器過期，需更換', severity: 'medium', status: 'in-progress' },
]

export const nearMissReports: NearMissReport[] = [
  { id: 'NM-001', reportDate: '2026-04-13', zone: 'Zone C', category: '高空墜物', description: '28/F 木模板因未固定妥當，風吹後差點跌落，幸無人受傷。附近工人及時走避。', anonymous: true, status: 'investigating' },
  { id: 'NM-002', reportDate: '2026-04-11', zone: 'Zone D', category: '滑倒', description: '20/F 幕牆作業平台有積水，工人差點滑倒。已即時清理。', anonymous: false, status: 'closed' },
  { id: 'NM-003', reportDate: '2026-04-08', zone: 'Zone E', category: '電氣', description: '電工接駁臨時電源時，發現電線絕緣層有破損，及時發現並更換。', anonymous: false, status: 'closed' },
  { id: 'NM-004', reportDate: '2026-04-06', zone: 'Zone B', category: '吊裝', description: '鋼筋吊裝時吊帶輕微脫落，操作員及時停機。建議加強吊帶檢查程序。', anonymous: true, status: 'investigating' },
]

export const workers: Worker[] = [
  { id: 'W001', name: '陳大文', trade: '鋼筋工', company: '金輝紮鐵', checkedIn: true, checkInTime: '07:12', zone: 'Zone C' },
  { id: 'W002', name: '李志明', trade: '混凝土工', company: '金輝紮鐵', checkedIn: true, checkInTime: '07:15', zone: 'Zone C' },
  { id: 'W003', name: '張偉強', trade: '木模工', company: '順興模板', checkedIn: true, checkInTime: '07:09', zone: 'Zone C' },
  { id: 'W004', name: '王小華', trade: '幕牆工', company: '環球幕牆', checkedIn: true, checkInTime: '07:22', zone: 'Zone D' },
  { id: 'W005', name: '劉國雄', trade: '電工', company: '明亮機電', checkedIn: false, zone: 'Zone E' },
  { id: 'W006', name: '黃志豪', trade: '管道工', company: '明亮機電', checkedIn: true, checkInTime: '07:31', zone: 'Zone E' },
  { id: 'W007', name: '林美珍', trade: '裝修工', company: '精緻裝修', checkedIn: true, checkInTime: '07:18', zone: 'Zone F' },
  { id: 'W008', name: '吳偉民', trade: '挖掘機手', company: 'Kwan Chun Kit', checkedIn: true, checkInTime: '06:58', zone: 'Zone G' },
  { id: 'W009', name: '鄭志偉', trade: '鋼筋工', company: '金輝紮鐵', checkedIn: false, zone: 'Zone C' },
  { id: 'W010', name: '梁國強', trade: '焊接工', company: 'Kwan Chun Kit', checkedIn: true, checkInTime: '07:05', zone: 'Zone C' },
  { id: 'W011', name: '何志遠', trade: '幕牆工', company: '環球幕牆', checkedIn: true, checkInTime: '07:28', zone: 'Zone D' },
  { id: 'W012', name: '曾小龍', trade: '混凝土工', company: '金輝紮鐵', checkedIn: true, checkInTime: '07:10', zone: 'Zone C' },
]

export const materials: Material[] = [
  { id: 'MAT001', name: '高強度混凝土 (C45)', unit: 'm³', onHand: 120, required: 180, ordered: 200, status: 'sufficient' },
  { id: 'MAT002', name: '鋼筋 T40 (每條 12m)', unit: '條', onHand: 85, required: 200, ordered: 300, status: 'low' },
  { id: 'MAT003', name: '鋼筋 T25 (每條 12m)', unit: '條', onHand: 340, required: 350, ordered: 0, status: 'low' },
  { id: 'MAT004', name: '木模板 (1.2x2.4m)', unit: '塊', onHand: 450, required: 400, ordered: 0, status: 'sufficient' },
  { id: 'MAT005', name: '幕牆玻璃 (標準面板)', unit: '塊', onHand: 12, required: 60, ordered: 80, status: 'critical' },
  { id: 'MAT006', name: '電纜 4mm² (每卷 100m)', unit: '卷', onHand: 25, required: 30, ordered: 20, status: 'low' },
  { id: 'MAT007', name: '輕鋼龍骨 (3m長)', unit: '條', onHand: 800, required: 500, ordered: 0, status: 'sufficient' },
  { id: 'MAT008', name: '混凝土泵車出租', unit: '天', onHand: 0, required: 3, ordered: 3, status: 'sufficient' },
]

export const tasks: Task[] = [
  { id: 'T001', title: '28-30/F 樓板澆築', zone: 'Zone C', assignee: '陳工頭', priority: 'urgent', status: 'in-progress', dueDate: '2026-04-14', description: '完成 28-30/F 主樓板混凝土澆築，預計用量 180m³，需連續施工。' },
  { id: 'T002', title: '22/F 幕牆修復', zone: 'Zone D', assignee: '麥工頭', priority: 'high', status: 'pending', dueDate: '2026-04-15', description: '修復 22/F 吊籠圍欄，安全巡查發現存在隱患，優先處理。' },
  { id: 'T003', title: '31/F 核心筒模板', zone: 'Zone B', assignee: '李工頭', priority: 'normal', status: 'in-progress', dueDate: '2026-04-16', description: '安裝 31/F 核心筒模板，為下周混凝土澆築做準備。' },
  { id: 'T004', title: '地下室防水驗收', zone: 'Zone A', assignee: '陳工頭', priority: 'normal', status: 'done', dueDate: '2026-04-12', description: '完成 B1/F 防水層質量驗收，符合設計要求。' },
  { id: 'T005', title: '5/F 滅火器更換', zone: 'Zone F', assignee: '鄭工頭', priority: 'high', status: 'pending', dueDate: '2026-04-14', description: '更換 5/F 裝修區所有過期滅火器，共 6 個。' },
  { id: 'T006', title: '幕牆玻璃備料確認', zone: 'Zone D', assignee: '王工程師', priority: 'high', status: 'pending', dueDate: '2026-04-15', description: '庫存幕牆玻璃嚴重不足，需聯絡供應商確認追加訂單。' },
  { id: 'T007', title: '主電纜安裝 19-21/F', zone: 'Zone E', assignee: '劉工頭', priority: 'normal', status: 'in-progress', dueDate: '2026-04-17', description: '完成 19-21/F 主電纜鋪設及接駁工作。' },
]

export const notifications: Notification[] = [
  { id: 'N001', type: 'safety', title: '⚠️ 安全巡查發現：Zone D 吊籠圍欄', body: '22/F 吊籠圍欄鬆脫，安全主任已發出整改指示，請即時跟進。', time: '09:15', read: false, priority: 'high' },
  { id: 'N002', type: 'material', title: '🚨 物料告急：幕牆玻璃庫存不足', body: '幕牆玻璃庫存僅餘 12 塊，無法支撐本周施工需求，需緊急補貨。', time: '08:42', read: false, priority: 'high' },
  { id: 'N003', type: 'progress', title: '📊 Zone F 進度落後警報', body: 'Zone F 室內裝修進度 18%，計劃目標 25%，落後 7 個百分點，請檢視加速方案。', time: '08:00', read: false, priority: 'high' },
  { id: 'N004', type: 'approval', title: '📋 PTW 待審批', body: 'PTW-2026-041 高空吊籠作業許可申請，申請人：麥工頭，請即時審閱。', time: '07:55', read: false, priority: 'medium' },
  { id: 'N005', type: 'issue', title: '🔧 圖則更新：STR-C-28-001 Rev.C', body: '28-30/F 樓板配筋圖已更新至 Rev.C，請通知相關工頭使用最新版本。', time: '07:30', read: true, priority: 'medium' },
  { id: 'N006', type: 'progress', title: '✅ 日報已提交：Zone C', body: '張工程師已提交 2026-04-14 Zone C 施工日報，待您審批。', time: '07:20', read: true, priority: 'low' },
]

export const milestones: Milestone[] = [
  { id: 'MS001', name: '主樓結構封頂 (42/F)', dueDate: '2026-06-30', status: 'on-track' },
  { id: 'MS002', name: '幕牆工程完成', dueDate: '2026-09-15', status: 'at-risk' },
  { id: 'MS003', name: '機電工程完成', dueDate: '2026-10-31', status: 'on-track' },
  { id: 'MS004', name: '室內裝修完成', dueDate: '2026-12-15', status: 'at-risk' },
  { id: 'MS005', name: '系統調試及驗收', dueDate: '2027-01-31', status: 'on-track' },
  { id: 'MS006', name: '竣工移交', dueDate: '2027-02-28', status: 'on-track' },
]

export const issues: Issue[] = [
  { id: 'ISS001', issueNo: 'ISS-2026-018', title: '幕牆玻璃供貨延誤', zone: 'Zone D', reportedBy: '王工程師', reportDate: '2026-04-12', priority: 'critical', status: 'in-progress', category: '供應鏈' },
  { id: 'ISS002', issueNo: 'ISS-2026-017', title: 'Zone F 進度落後，分包商人手不足', zone: 'Zone F', reportedBy: '黃工程師', reportDate: '2026-04-10', priority: 'high', status: 'in-progress', category: '進度' },
  { id: 'ISS003', issueNo: 'ISS-2026-016', title: '28/F 混凝土強度測試不達標', zone: 'Zone C', reportedBy: '張工程師', reportDate: '2026-04-08', priority: 'high', status: 'in-progress', category: '質量' },
  { id: 'ISS004', issueNo: 'ISS-2026-015', title: '臨時供電容量不足，影響機電工程', zone: 'Zone E', reportedBy: '劉工程師', reportDate: '2026-04-06', priority: 'medium', status: 'open', category: '技術' },
  { id: 'ISS005', issueNo: 'ISS-2026-014', title: '外部圍欄需更新以符合最新法規', zone: 'Zone G', reportedBy: '林工程師', reportDate: '2026-04-03', priority: 'low', status: 'open', category: '合規' },
]

export const incidentTrendData: IncidentTrendPoint[] = [
  { month: '2025-04', nearMiss: 3, minorInjury: 1, observation: 8 },
  { month: '2025-05', nearMiss: 2, minorInjury: 0, observation: 6 },
  { month: '2025-06', nearMiss: 4, minorInjury: 1, observation: 10 },
  { month: '2025-07', nearMiss: 1, minorInjury: 0, observation: 7 },
  { month: '2025-08', nearMiss: 3, minorInjury: 1, observation: 9 },
  { month: '2025-09', nearMiss: 2, minorInjury: 0, observation: 5 },
  { month: '2025-10', nearMiss: 5, minorInjury: 1, observation: 11 },
  { month: '2025-11', nearMiss: 2, minorInjury: 0, observation: 6 },
  { month: '2025-12', nearMiss: 1, minorInjury: 0, observation: 4 },
  { month: '2026-01', nearMiss: 3, minorInjury: 0, observation: 7 },
  { month: '2026-02', nearMiss: 2, minorInjury: 0, observation: 5 },
  { month: '2026-03', nearMiss: 4, minorInjury: 0, observation: 8 },
]

export const safetyCategories = [
  { name: '高空作業', value: 32, color: '#ef4444' },
  { name: '個人防護', value: 24, color: '#f97316' },
  { name: '電氣安全', value: 18, color: '#eab308' },
  { name: '吊裝作業', value: 14, color: '#3b82f6' },
  { name: '其他', value: 12, color: '#8b5cf6' },
]

export const costBreakdown = [
  { category: '勞工', budget: 280, spent: 165, color: '#3b82f6' },
  { category: '材料', budget: 350, spent: 218, color: '#10b981' },
  { category: '機械設備', budget: 120, spent: 78, color: '#f59e0b' },
  { category: '分包', budget: 80, spent: 52, color: '#8b5cf6' },
  { category: '雜費', budget: 20, spent: 14, color: '#6b7280' },
]

// ── User ID reference (mirrors AuthContext) ─────────────────────────────────
// U001 = pm.lee (PM)         U002 = pe.zhang (PE)     U003 = cp.chen (CP)
// U004 = fm.mak (Foreman)    U005 = w.chan (Worker)    U006 = ss.wong (Sub-sup)

// ── Progress Items (WBS) ────────────────────────────────────────────────────
const pi = (
  id: string, code: string, title: string, zone: string,
  parentId: string | null, level: 1 | 2 | 3,
  ps: string, pe_: string, pp: number, ap: number,
  status: ProgressItem['status'],
  ownedBy: string[], delegatedTo: string[],
  notes = '', updatedBy = '', updatedAt = '2026-04-14T08:00:00'
): ProgressItem => ({
  id, code, title, zone, parentId, level,
  projectId: 'PROJ001',
  plannedStart: ps, plannedEnd: pe_,
  plannedProgress: pp, actualProgress: ap, status,
  ownedBy, delegatedTo, notes, lastUpdatedBy: updatedBy, lastUpdatedAt: updatedAt,
  trackingMode: 'percentage', floorLabels: [], floorsCompleted: [],
})

export const progressItems: ProgressItem[] = [
  // ══ Zone A — 地基及地下室 (100%) ══
  pi('PA',   'A',     'Zone A — 地基及地下室',     'Zone A', null, 1, '2024-03-01','2024-12-31', 100,100,'completed',  ['U002'],[]),
  pi('PA1',  'A-1',   'B2 開挖工程',               'Zone A', 'PA', 2, '2024-03-01','2024-06-30', 100,100,'completed',  ['U002'],[]),
  pi('PA2',  'A-2',   '地基樁基工程',               'Zone A', 'PA', 2, '2024-04-01','2024-09-30', 100,100,'completed',  ['U002'],[]),
  pi('PA3',  'A-3',   '地下室底板及牆身結構',       'Zone A', 'PA', 2, '2024-07-01','2024-12-31', 100,100,'completed',  ['U004'],['U006'],'已完成驗收'),

  // ══ Zone B — 核心筒結構 (88%) ══
  pi('PB',   'B',     'Zone B — 核心筒結構',        'Zone B', null, 1, '2024-06-01','2026-03-31', 90,88,'in-progress', ['U002'],[]),
  pi('PB1',  'B-1',   '核心筒 1–20/F 結構',         'Zone B', 'PB', 2, '2024-06-01','2025-06-30', 100,100,'completed', ['U004'],['U006']),
  pi('PB2',  'B-2',   '核心筒 21–31/F 結構',        'Zone B', 'PB', 2, '2025-07-01','2026-03-31', 80,76,'in-progress',['U004'],['U006'],'31/F 澆築待排期'),

  // ══ Zone C — 主樓結構 (72%) ══
  pi('PC',   'C',     'Zone C — 主樓結構',          'Zone C', null, 1, '2024-08-01','2026-06-30', 78,72,'in-progress', ['U002'],[]),
  pi('PC1',  'C-1',   '主樓 1–10/F 結構',           'Zone C', 'PC', 2, '2024-08-01','2025-04-30', 100,100,'completed', ['U004'],['U006']),
  pi('PC1a', 'C-1-1', '1–5/F 模板安裝',             'Zone C', 'PC1',3, '2024-08-01','2024-10-31', 100,100,'completed', ['U006'],[]),
  pi('PC1b', 'C-1-2', '1–5/F 鋼筋綁紮',             'Zone C', 'PC1',3, '2024-09-01','2024-11-30', 100,100,'completed', ['U006'],[]),
  pi('PC1c', 'C-1-3', '1–5/F 混凝土澆築',           'Zone C', 'PC1',3, '2024-10-01','2024-12-31', 100,100,'completed', ['U006'],[]),
  pi('PC1d', 'C-1-4', '6–10/F 模板安裝',            'Zone C', 'PC1',3, '2024-12-01','2025-02-28', 100,100,'completed', ['U006'],[]),
  pi('PC1e', 'C-1-5', '6–10/F 鋼筋綁紮',            'Zone C', 'PC1',3, '2025-01-01','2025-03-31', 100,100,'completed', ['U006'],[]),
  pi('PC1f', 'C-1-6', '6–10/F 混凝土澆築',          'Zone C', 'PC1',3, '2025-02-01','2025-04-30', 100,100,'completed', ['U006'],[]),

  pi('PC2',  'C-2',   '主樓 11–20/F 結構',          'Zone C', 'PC', 2, '2025-05-01','2025-11-30', 100,95,'in-progress',['U004'],['U006']),
  pi('PC2a', 'C-2-1', '11–15/F 模板安裝',           'Zone C', 'PC2',3, '2025-05-01','2025-07-31', 100,100,'completed', ['U006'],[]),
  pi('PC2b', 'C-2-2', '11–15/F 鋼筋綁紮',           'Zone C', 'PC2',3, '2025-06-01','2025-08-31', 100,100,'completed', ['U006'],[]),
  pi('PC2c', 'C-2-3', '11–15/F 混凝土澆築',         'Zone C', 'PC2',3, '2025-07-01','2025-09-30', 100,100,'completed', ['U006'],[]),
  pi('PC2d', 'C-2-4', '16–20/F 模板安裝',           'Zone C', 'PC2',3, '2025-09-01','2025-11-30', 100,98,'in-progress',['U006'],[],'剩餘收口工序'),
  pi('PC2e', 'C-2-5', '16–20/F 鋼筋綁紮',           'Zone C', 'PC2',3, '2025-10-01','2025-12-31', 100,85,'in-progress',['U006'],[]),
  pi('PC2f', 'C-2-6', '16–20/F 混凝土澆築',         'Zone C', 'PC2',3, '2025-11-01','2026-01-31', 100,72,'in-progress',['U006'],[]),

  pi('PC3',  'C-3',   '主樓 21–30/F 結構',          'Zone C', 'PC', 2, '2025-12-01','2026-05-31', 75,58,'delayed',    ['U004'],['U006'],'進度落後約 2 周'),
  pi('PC3a', 'C-3-1', '21–25/F 模板安裝',           'Zone C', 'PC3',3, '2025-12-01','2026-02-28', 100,100,'completed',['U006'],[]),
  pi('PC3b', 'C-3-2', '21–25/F 鋼筋綁紮',           'Zone C', 'PC3',3, '2026-01-01','2026-03-15', 100,95,'in-progress',['U006'],[],'接近完成'),
  pi('PC3c', 'C-3-3', '21–25/F 混凝土澆築',         'Zone C', 'PC3',3, '2026-02-01','2026-03-31', 100,75,'in-progress',['U006'],[]),
  pi('PC3d', 'C-3-4', '26–30/F 模板安裝',           'Zone C', 'PC3',3, '2026-03-01','2026-04-30', 80,62,'delayed',    ['U006'],[],'受物料延遲影響'),
  pi('PC3e', 'C-3-5', '26–30/F 鋼筋綁紮',           'Zone C', 'PC3',3, '2026-03-15','2026-05-15', 55,28,'delayed',    ['U006'],[],'待模板完成後跟進'),
  pi('PC3f', 'C-3-6', '26–30/F 混凝土澆築',         'Zone C', 'PC3',3, '2026-04-15','2026-05-31', 15, 0,'not-started',['U006'],[]),

  pi('PC4',  'C-4',   '主樓 31–42/F 結構',          'Zone C', 'PC', 2, '2026-04-01','2026-06-30', 35,18,'delayed',    ['U004'],[]),
  pi('PC4a', 'C-4-1', '31–35/F 模板安裝',           'Zone C', 'PC4',3, '2026-04-01','2026-05-15', 70,55,'in-progress',['U006'],[]),
  pi('PC4b', 'C-4-2', '31–35/F 鋼筋綁紮',           'Zone C', 'PC4',3, '2026-04-10','2026-05-25', 50,18,'delayed',    ['U006'],[]),
  pi('PC4c', 'C-4-3', '31–35/F 混凝土澆築',         'Zone C', 'PC4',3, '2026-05-01','2026-06-15', 20, 5,'in-progress',['U006'],[]),
  pi('PC4d', 'C-4-4', '36–42/F 模板安裝',           'Zone C', 'PC4',3, '2026-05-15','2026-06-30',  5, 0,'not-started',[],[]),

  // ══ Zone D — 幕牆及外飾 (45%) ══
  pi('PD',   'D',     'Zone D — 幕牆及外飾',        'Zone D', null, 1, '2025-06-01','2026-09-30', 55,45,'delayed',    ['U002'],[]),
  pi('PD1',  'D-1',   '幕牆 1–15/F 玻璃安裝',       'Zone D', 'PD', 2, '2025-06-01','2026-03-31', 95,85,'in-progress',['U002'],[]),
  pi('PD2',  'D-2',   '幕牆 16–30/F 玻璃安裝',      'Zone D', 'PD', 2, '2025-10-01','2026-06-30', 60,42,'delayed',   ['U002'],[],'玻璃供貨延遲 6 周'),
  pi('PD3',  'D-3',   '幕牆 31–42/F 玻璃安裝',      'Zone D', 'PD', 2, '2026-02-01','2026-09-30', 15, 8,'in-progress',['U002'],[]),

  // ══ Zone E — 機電工程 (38%) ══
  pi('PE_',  'E',     'Zone E — 機電工程',          'Zone E', null, 1, '2025-03-01','2026-10-31', 40,38,'in-progress', ['U002'],[]),
  pi('PE1',  'E-1',   'B2–10/F 主幹電纜鋪設',       'Zone E', 'PE_',2, '2025-03-01','2026-03-31', 90,82,'in-progress',['U002'],[]),
  pi('PE2',  'E-2',   '11–25/F 機電系統安裝',       'Zone E', 'PE_',2, '2025-09-01','2026-07-31', 45,38,'in-progress',['U002'],[]),
  pi('PE3',  'E-3',   '26–42/F 機電系統安裝',       'Zone E', 'PE_',2, '2026-03-01','2026-10-31',  8, 3,'not-started',['U002'],[]),

  // ══ Zone F — 室內裝修 (18%) ══
  pi('PF',   'F',     'Zone F — 室內裝修',          'Zone F', null, 1, '2025-09-01','2026-12-31', 25,18,'delayed',    ['U002'],[]),
  pi('PF1',  'F-1',   '1–5/F 辦公室輕鋼龍骨',      'Zone F', 'PF', 2, '2025-09-01','2026-04-30', 55,35,'delayed',   ['U002'],[],'人手不足，需增援'),
  pi('PF2',  'F-2',   '6–15/F 辦公室裝修',          'Zone F', 'PF', 2, '2025-12-01','2026-08-31', 18, 8,'in-progress',['U002'],[]),

  // ══ Zone G — 外部工程 (12%) ══
  pi('PG',   'G',     'Zone G — 外部工程',          'Zone G', null, 1, '2025-08-01','2026-11-30', 15,12,'in-progress', ['U004'],[]),
  pi('PG1',  'G-1',   '外部排水渠及道路',            'Zone G', 'PG', 2, '2025-08-01','2026-08-31', 25,20,'in-progress',['U004'],[]),
  pi('PG2',  'G-2',   '綠化及景觀美化',             'Zone G', 'PG', 2, '2026-03-01','2026-11-30',  5, 2,'not-started',['U004'],[]),

  // ══ Zone H — 系統調試 (3%) ══
  pi('PH',   'H',     'Zone H — 系統調試',          'Zone H', null, 1, '2026-09-01','2027-01-31',  5, 3,'not-started', ['U002'],[]),
  pi('PH1',  'H-1',   '消防系統測試',               'Zone H', 'PH', 2, '2026-09-01','2026-11-30',  5, 2,'not-started',['U002'],[]),
  pi('PH2',  'H-2',   '機電系統調試',               'Zone H', 'PH', 2, '2026-10-01','2027-01-31',  3, 0,'not-started',['U002'],[]),
]

// ── Site Messages ───────────────────────────────────────────────────────────
export const siteMessages: SiteMessage[] = [
  {
    id: 'MSG001',
    type: 'progress-report',
    from: 'U006', fromName: '王建國', fromRole: 'sub-contractor',
    to: ['U004', 'U002'], toNames: ['麥偉強 (工頭)', '張志豪 (工程師)'],
    subject: '【進度匯報】Zone C — 26-30/F 模板安裝進度更新',
    body: '截至今日下午，26-30/F 模板安裝完成 62%，較計劃進度落後約 18%。主要原因：上周連續兩日大雨，無法施工；今日人手 14 名，預計明後天可追回 10% 進度。',
    zone: 'Zone C',
    progressRef: 'PC3d',
    sentAt: '2026-04-14T15:30:00',
    readBy: ['U004'],
  },
  {
    id: 'MSG002',
    type: 'issue-report',
    from: 'U006', fromName: '王建國', fromRole: 'sub-contractor',
    to: ['U004', 'U002', 'U001'], toNames: ['麥偉強 (工頭)', '張志豪 (工程師)', '李建明 (總監)'],
    subject: '【問題上報】Zone C 28/F 鋼筋碰撞問題',
    body: '在 28/F C 軸鋼筋施工時，發現有位置與機電預埋管位置碰撞，需設計單位澄清。已暫停該位置施工，影響約 15 名工人。請工程師盡快確認圖則更改。',
    zone: 'Zone C',
    sentAt: '2026-04-13T11:15:00',
    readBy: ['U004', 'U002'],
  },
  {
    id: 'MSG003',
    type: 'general',
    from: 'U004', fromName: '麥偉強', fromRole: 'main-contractor',
    to: ['U006'], toNames: ['王建國 (判頭打理)'],
    subject: '委派：PC4-1 至 PC4-3 進度管理',
    body: '現委派你負責管理 31-35/F 模板、鋼筋及澆築三個工序的進度更新，請每日下午 5 時前在系統更新實際進度百分比，如有問題即時上報。',
    zone: 'Zone C',
    progressRef: 'PC4',
    sentAt: '2026-04-10T09:00:00',
    readBy: ['U006'],
  },
  {
    id: 'MSG004',
    type: 'progress-report',
    from: 'U006', fromName: '王建國', fromRole: 'sub-contractor',
    to: ['U004'], toNames: ['麥偉強 (工頭)'],
    subject: '【每日更新】Zone B 核心筒 21-31/F 進度',
    body: '今日完成 29/F 核心筒鋼筋綁紮驗收，30/F 模板安裝進行中，預計明日完成。整體進度符合計劃。',
    zone: 'Zone B',
    progressRef: 'PB2',
    sentAt: '2026-04-14T17:00:00',
    readBy: [],
  },
]
