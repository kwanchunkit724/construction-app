import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Smartphone, Globe, MessageSquareOff, FileWarning, FileSpreadsheet,
  HardHat, ClipboardCheck, LayoutDashboard, ShieldCheck, Check, X,
  ArrowRight, Mail, Loader2, Send, FileDown,
  ListChecks, AlertCircle, Package, BookOpen, FileText, FileCheck2,
  CalendarDays, Contact as ContactIcon, Image as ImageIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// Public sales landing at /#/sell. Industrial / blueprint aesthetic:
// dark slate base, hi-vis safety-orange accents, blueprint-grid texture,
// hazard-stripe dividers, numbered engineering-drawing sections.
// Built from .planning/sales-kit/. zh-HK, mobile-first.

const APP_STORE = 'https://apps.apple.com/app/id6764754372'
const PLAY_STORE = 'https://play.google.com/apps/testing/com.kwanchunkit.constructionapp'
const WEB_APP = 'https://construction-app-lime-six.vercel.app'
const EMAIL = 'kck980724@gmail.com'

// Faint blueprint grid, drawn with CSS gradients (no asset needed).
const GRID_DARK: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
}
const GRID_LIGHT: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
}
const HAZARD: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, #f97316 0 14px, #0f172a 14px 28px)',
}

export default function SellPage() {
  return (
    <div className="min-h-screen bg-site-950 text-site-900 font-sans antialiased">
      <Nav />
      <Hero />
      <HazardRule />
      <Pain />
      <Numbers />
      <Solution />
      <HowItWorks />
      <Compare />
      <Pricing />
      <Roi />
      <Trust />
      <Screenshots />
      <LeadCapture />
      <CloseCta />
      <Footer />
    </div>
  )
}

// ── shared bits ─────────────────────────────────────────────
function HazardRule() {
  return <div className="h-1.5 w-full" style={HAZARD} />
}

function Section({ children, n, kicker, title, tone = 'light', center }: {
  children: React.ReactNode
  n?: string
  kicker?: string
  title?: React.ReactNode
  tone?: 'light' | 'dark'
  center?: boolean
  id?: string
}) {
  const dark = tone === 'dark'
  return (
    <section className={`relative ${dark ? 'bg-site-950 text-white' : 'bg-white text-site-900'} py-16 md:py-24 overflow-hidden`}>
      <div className="absolute inset-0 pointer-events-none" style={dark ? GRID_DARK : GRID_LIGHT} />
      <div className="relative max-w-6xl mx-auto px-5 md:px-8">
        {(kicker || title) && (
          <div className={`mb-12 ${center ? 'text-center max-w-3xl mx-auto' : 'max-w-3xl'}`}>
            {kicker && (
              <div className="flex items-center gap-2 mb-3 justify-start" style={center ? { justifyContent: 'center' } : undefined}>
                {n && <span className="font-mono text-xs font-bold text-safety-500 tracking-widest">{n}</span>}
                <span className="h-px w-8 bg-safety-500" />
                <span className={`font-mono text-xs font-semibold uppercase tracking-[0.2em] ${dark ? 'text-site-400' : 'text-site-500'}`}>{kicker}</span>
              </div>
            )}
            {title && (
              <h2 className={`font-heading text-3xl md:text-5xl font-extrabold leading-[1.05] tracking-tight ${dark ? 'text-white' : 'text-site-900'}`} style={{ textWrap: 'balance' } as React.CSSProperties}>
                {title}
              </h2>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  )
}

// ── NAV ─────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="sticky top-0 z-40 bg-site-950/85 backdrop-blur-md border-b border-white/10">
      <div className="max-w-6xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-safety-500 text-white grid place-items-center font-heading font-extrabold shadow-[0_4px_16px_-4px_rgba(249,115,22,0.6)]">CK</div>
          <span className="font-heading font-bold text-white tracking-tight">CK工程</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <a href="#pricing" className="hidden sm:inline text-sm text-site-300 hover:text-white px-3 py-2 transition">定價</a>
          <a href="#trial" className="bg-safety-500 hover:bg-safety-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-[0_4px_16px_-4px_rgba(249,115,22,0.6)]">
            免費試用
          </a>
        </div>
      </div>
    </header>
  )
}

// ── HERO ────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative bg-site-950 text-white overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={GRID_DARK} />
      {/* orange glow */}
      <div className="absolute -top-32 -right-32 w-[36rem] h-[36rem] rounded-full bg-safety-500/20 blur-[120px] pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-5 md:px-8 py-16 md:py-24 grid md:grid-cols-[1.1fr_0.9fr] gap-12 md:gap-8 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-widest text-safety-400 bg-safety-500/10 ring-1 ring-safety-500/30 rounded-full px-3 py-1.5 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-safety-400 animate-pulse" />
            iOS App Store 已上架 · Android 測試中
          </div>
          <h1 className="font-heading font-extrabold tracking-tight leading-[1.05]">
            <span className="block text-white text-[1.85rem] sm:text-5xl">取代地盤嘅</span>
            {/* One non-breaking unit so "紙簿" never splits mid-word; mobile size kept
                small enough that the nowrap phrase can't overflow a 360px viewport. */}
            <span className="block mt-1.5 text-safety-500 text-[1.85rem] sm:text-5xl">
              <span className="inline-block whitespace-nowrap">
                WhatsApp<span className="text-site-700 mx-1">+</span>Excel<span className="text-site-700 mx-1">+</span>紙簿
              </span>
            </span>
          </h1>
          <p className="mt-7 text-base md:text-lg text-site-300 leading-relaxed max-w-xl">
            判頭、工程師、PM 一齊喺同一個 app 寫每日進度、報問題、申請物料、簽 PTW。
            出 dispute 嗰時，<span className="text-white font-medium">每一個 action 都有時間戳同 audit trail</span>。
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href={APP_STORE} target="_blank" rel="noreferrer" className="group bg-safety-500 hover:bg-safety-600 text-white font-semibold px-6 py-3.5 rounded-xl flex items-center gap-2 transition shadow-[0_8px_30px_-8px_rgba(249,115,22,0.7)]">
              <Smartphone size={18} /> 下載 iOS App
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
            </a>
            <a href={WEB_APP} target="_blank" rel="noreferrer" className="border border-white/20 hover:bg-white/5 text-white font-semibold px-6 py-3.5 rounded-xl flex items-center gap-2 transition">
              <Globe size={18} /> 即開 Web 版
            </a>
          </div>
          <div className="mt-5 flex items-center gap-4 text-sm text-site-400 font-mono">
            <span>1 個月試用 <span className="text-white font-bold">HK$0</span></span>
            <span className="text-site-700">|</span>
            <span>無需信用卡</span>
            <span className="text-site-700">|</span>
            <span>zh-HK</span>
          </div>
        </div>

        {/* Phone mock */}
        <div className="flex justify-center md:justify-end">
          <PhoneMock />
        </div>
      </div>
    </section>
  )
}

function PhoneMock() {
  const rows = [
    { z: 'N座', t: '結構工程', p: 72, c: 'bg-green-500' },
    { z: 'S座', t: '機電安裝', p: 45, c: 'bg-blue-500' },
    { z: '地庫', t: '防水工程', p: 88, c: 'bg-safety-500' },
  ]
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-safety-500/20 blur-2xl rounded-[3rem] pointer-events-none" />
      <div className="relative w-[264px] rounded-[2.4rem] border-[10px] border-site-800 bg-site-800 shadow-2xl overflow-hidden ring-1 ring-white/10">
        <div className="bg-white">
          <div className="bg-gradient-to-r from-safety-500 to-safety-600 text-white px-4 py-3.5 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/25 grid place-items-center text-xs font-heading font-bold">CK</div>
            <div className="text-sm font-semibold">DC2026 油塘住宅</div>
          </div>
          <div className="p-3 space-y-2">
            {rows.map(r => (
              <div key={r.z} className="rounded-xl border border-site-200 p-3">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-site-800"><span className="text-safety-600">[{r.z}]</span> {r.t}</span>
                  <span className="font-mono text-site-500 tabular-nums">{r.p}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-site-100 overflow-hidden">
                  <div className={`h-full ${r.c}`} style={{ width: `${r.p}%` }} />
                </div>
              </div>
            ))}
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2">
              <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded">急件</span>
              <span className="text-xs text-site-700">接駁管 — 等緊批</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SCREENSHOTS (product showcase, one consistent demo project) ──
function Screenshots() {
  const shots = [
    { img: '/marketing/shot-progress.png', icon: <ListChecks size={16} />, t: '成個地盤進度，一眼睇晒', d: '大項／中項／細項分層管理，最底一打勾，上面自動匯總百分比同狀態。邊區紅咗、落後幾多，一打開就知。' },
    { img: '/marketing/shot-issues.png', icon: <AlertCircle size={16} />, t: '問題唔會再沉底，一層一層有人接', d: '報問題影相即傳，跟住固定上呈鏈：判頭→主判→PM。每一步邊個接、邊個解決全部記低，有完整活動紀錄可以追。' },
    { img: '/marketing/shot-materials.png', icon: <Package size={16} />, t: '叫料即通知老總，逾期自動標紅', d: '判頭喺手機落單叫料，撳「急件」即時推送。系統追預計到貨同入貨進度，過咗期未到自動標逾期，仲連結返對應進度。' },
    { img: '/marketing/shot-dashboard.png', icon: <LayoutDashboard size={16} />, t: 'PM 唔使落地盤都知盤數', d: '儀表板即時顯示整體進度、落後工地同處理中問題，仲有實時動態。老總一眼掃晒幾個盤嘅健康狀況，唔使等開會先發現甩漏。' },
    { img: '/marketing/shot-export.png', icon: <FileDown size={16} />, t: '一鍵出報告，業主版／內部版自動分流', d: '揀「業主版一頁紙」畀老闆 10 秒睇明，或「內部版詳細」「例外版」畀自己用。出 PDF 前有即時範圍預覽，唔使再人手砌報告。' },
    { img: '/marketing/shot-contacts.png', icon: <ContactIcon size={16} />, t: '行頭通訊錄，撳一下即刻打電話', d: '聯絡人就係成個行頭嘅通訊錄，按工種分類、可搜尋，撳一下即刻致電。唔使再喺幾個 WhatsApp 群組揾邊個判頭。' },
    { img: '/marketing/shot-si.png', icon: <FileText size={16} />, t: '工地指令版本鎖死，改過咩一目了然', d: 'SI 工地指令逐版簽核 + 版本對比，睇返每次改咗咩、邊個簽。指令鎖定後一鍵轉做變更指令，出爭拗憑紀錄講數，唔使翻舊 WhatsApp。' },
    { img: '/marketing/shot-vo.png', icon: <FileCheck2 size={16} />, t: '變更指令金額，系統幫你計到一蚊都唔差', d: 'VO 逐項填數量、單價、類別，總額由系統核算（HKD），唔靠人手 Excel 加數。批核完一鍵出 PDF，連圖則參照同簽核時間線，直接畀業主對數。' },
    { img: '/marketing/shot-ptw.png', icon: <ShieldCheck size={16} />, t: '動火高空吊運，安全主任電子簽核', d: 'PTW 工作許可證涵蓋動火、高空、吊運等高風險工序，附安全核對清單同工人名單，由安全主任逐步簽。動火仲有 30 分鐘火警監察計時，生效期間出 QR 碼俾人巡查掃描。' },
    { img: '/marketing/shot-timetable.png', icon: <CalendarDays size={16} />, t: '到貨、完工、會議，一個行事曆睇晒', d: '行事曆自動 merge 三樣嘢落同一條時間線：物料到貨、進度完工、會議檢查。邊日有咩死線一覽無遺，唔使再開幾個表去對。' },
    { img: '/marketing/shot-daily.png', icon: <BookOpen size={16} />, t: '每日工地日誌，過咗今日就鎖死', d: '管工每日揀天氣、剔返今日做咗嘅進度項目、寫低備註同出勤。按香港時間鎖定，尋日嘅改唔到 —— 落雨停工、待料全部留底，做你 EOT／索償嘅 contemporaneous 證據。' },
    { img: '/marketing/shot-drawings.png', icon: <ImageIcon size={16} />, t: '圖則掛喺工序度，逐版追蹤邊張係現行', d: '每張圖則掛喺對應嘅工序底下，逐版上載、版本對比，狀態標「現行 / 已取代」。全地盤睇住同一個現行版本，唔會撞錯舊圖；SI 仲可以指定引用邊個 rev。' },
  ]
  const more: { icon: React.ReactNode; t: string }[] = []
  return (
    <Section n="09" kicker="睇真啲 · 同一個地盤" title={<>一個 demo 地盤，<span className="text-safety-500">由開工睇到完工</span></>}>
      <p className="-mt-6 mb-12 max-w-2xl text-base text-site-600 leading-relaxed">
        以下每一張截圖，全部嚟自同一個地盤「<span className="font-semibold text-site-800">油塘灣住宅發展項目</span>」。由判頭叫料、管工寫日誌、工地主任追進度、到 PM 出報告畀業主 —— 你會見到成個地盤點樣喺一個系統入面運作，每個動作都有時間戳同簽名。
      </p>
      <div className="space-y-16 md:space-y-24">
        {shots.map((s, i) => (
          <div key={s.t} className={`grid md:grid-cols-2 gap-10 md:gap-14 items-center ${i % 2 ? 'md:[&>div:first-child]:order-2' : ''}`}>
            <div className="flex justify-center"><ShotPhone img={s.img} /></div>
            <div className="max-w-md mx-auto md:mx-0">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-xs font-bold text-safety-500 tracking-widest">{String(i + 1).padStart(2, '0')}</span>
                <span className="h-px w-8 bg-safety-500" />
                <span className="text-safety-600">{s.icon}</span>
              </div>
              <h3 className="font-heading font-bold text-xl md:text-2xl text-site-900" style={{ textWrap: 'balance' } as React.CSSProperties}>{s.t}</h3>
              <p className="mt-3 text-sm md:text-base text-site-600 leading-relaxed">{s.d}</p>
            </div>
          </div>
        ))}
      </div>
      {more.length > 0 && (
        <div className="mt-16 rounded-2xl border border-site-200 bg-site-50/60 p-6 md:p-8">
          <div className="font-mono text-xs uppercase tracking-widest text-site-400 mb-4">仲有 —— 同一個 app 入面</div>
          <div className="flex flex-wrap gap-2.5">
            {more.map(m => (
              <div key={m.t} className="inline-flex items-center gap-2 rounded-full bg-white border border-site-200 px-4 py-2 text-sm font-medium text-site-700 shadow-sm">
                <span className="text-safety-600">{m.icon}</span> {m.t}
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

function ShotPhone({ img }: { img: string }) {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-safety-500/20 blur-2xl rounded-[3rem] pointer-events-none" />
      <div className="relative w-[256px] md:w-[268px] rounded-[2.4rem] border-[10px] border-site-800 bg-site-800 shadow-2xl overflow-hidden ring-1 ring-white/10">
        <div className="bg-white aspect-[390/800] overflow-hidden">
          <img src={img} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
        </div>
      </div>
    </div>
  )
}

// ── PAIN ────────────────────────────────────────────────────
function Pain() {
  const items = [
    { icon: <MessageSquareOff size={24} />, t: 'WhatsApp', d: '揾唔到上個月 02 號邊個簽嘅 PTW。200 條未讀，問題沉晒底。' },
    { icon: <FileWarning size={24} />, t: '紙簿', d: '落雨整濕、塵蓋住、收唔到 office。出 dispute 揾唔返。' },
    { icon: <FileSpreadsheet size={24} />, t: 'Excel', d: 'PM 用緊 v3 final FINAL，foreman 用緊 v1。冇人知邊個啱。' },
  ]
  return (
    <Section n="01" kicker="今日嘅地盤現實" title="資料散晒，dispute 嗰時靠記性">
      <div className="grid md:grid-cols-3 gap-5">
        {items.map((i, idx) => (
          <div key={i.t} className="group relative bg-white border border-site-200 rounded-2xl p-6 hover:border-red-300 hover:shadow-xl transition">
            <div className="absolute top-5 right-5 font-mono text-5xl font-extrabold text-site-100 group-hover:text-red-100 transition">0{idx + 1}</div>
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 grid place-items-center mb-4 ring-1 ring-red-100">{i.icon}</div>
            <div className="font-heading font-bold text-xl text-site-900">{i.t}</div>
            <p className="mt-2 text-sm text-site-600 leading-relaxed">{i.d}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── NUMBERS ─────────────────────────────────────────────────
function Numbers() {
  const stats = [
    { n: 'HK$50K', d: '平均一單 dispute settlement（行業估算）' },
    { n: '2 hr', d: 'PM 每日花喺追 foreman daily report' },
    { n: '45%', d: 'site issues 升級之後先發現' },
  ]
  return (
    <Section n="02" kicker="呢個 cost 你幾錢" title="每個鐘 PM 唔知地盤點，就係 dispute 嘅土壤" tone="dark">
      <div className="grid md:grid-cols-3 gap-5">
        {stats.map(s => (
          <div key={s.n} className="relative rounded-2xl bg-white/[0.03] border border-white/10 p-8 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-safety-500" />
            <div className="font-heading text-5xl md:text-6xl font-extrabold text-safety-500 tabular-nums tracking-tight">{s.n}</div>
            <div className="mt-3 text-sm text-site-300 leading-relaxed">{s.d}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── SOLUTION ────────────────────────────────────────────────
function Solution() {
  const cols = [
    { icon: <HardHat size={22} />, role: '判頭', points: ['物料 request + 急件 alert', '逾期 / 吹大水即時知', '自動 link 進度項目'] },
    { icon: <ClipboardCheck size={22} />, role: '工程師 / 管工', points: ['30 秒 daily report', 'PTW 電子簽 + 拎相', '焊接 / 棚架全部 PTW'] },
    { icon: <LayoutDashboard size={22} />, role: '老總 / PM', points: ['Real-time 4-zone dashboard', 'Audit trail for dispute', '自動 escalation chain'] },
  ]
  return (
    <Section n="03" kicker="一個 app，三個角色" title={<>全部 <span className="text-safety-500">audit trail</span></>}>
      <div className="grid md:grid-cols-3 gap-5">
        {cols.map(c => (
          <div key={c.role} className="relative bg-site-950 rounded-2xl overflow-hidden">
            <div className="h-1.5 w-full" style={HAZARD} />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-safety-500 text-white grid place-items-center">{c.icon}</div>
                <div className="font-heading font-bold text-lg text-white">{c.role}</div>
              </div>
              <ul className="space-y-2.5">
                {c.points.map(p => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-site-300">
                    <Check size={16} className="text-safety-500 flex-shrink-0 mt-0.5" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center font-mono text-sm text-site-500">每一個 click 都有 timestamp + user 簽名</p>
    </Section>
  )
}

// ── HOW IT WORKS ────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { time: '09:00', d: '判頭喺 app 申請物料（急件 toggle）→ 老總即收 push notification' },
    { time: '14:00', d: 'Foreman 喺手機 update 進度 60% → office 即見' },
    { time: '18:00', d: 'PM 一鍵 export 今日 PDF → 俾 owner / 加入 dispute file' },
  ]
  return (
    <Section n="04" kicker="早 9 到晚 6" title="3 個步驟，WhatsApp 唔再做 ops" tone="dark">
      <div className="space-y-4">
        {steps.map((s, i) => (
          <div key={s.time} className="flex items-stretch gap-4 md:gap-6">
            <div className="flex-shrink-0 w-24 md:w-32 rounded-xl bg-safety-500 grid place-items-center">
              <span className="font-mono font-extrabold text-xl md:text-2xl text-white tabular-nums">{s.time}</span>
            </div>
            <div className="flex-1 rounded-xl bg-white/[0.03] border border-white/10 px-5 py-4 flex items-center">
              <span className="font-mono text-safety-500 mr-3 font-bold">{i + 1}.</span>
              <p className="text-site-200 text-sm md:text-base">{s.d}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-8 font-mono text-sm text-site-500">WhatsApp 留俾鍾意 chat 嘅人。</p>
    </Section>
  )
}

// ── COMPARE ─────────────────────────────────────────────────
function Compare() {
  const rows: { label: string; procore: boolean | string; cubicost: boolean | string; ck: boolean | string }[] = [
    { label: '繁中 zh-HK 介面', procore: '英文 only', cubicost: '簡中', ck: true },
    { label: 'HK 術語 (PTW/SI/VO/判頭)', procore: false, cubicost: false, ck: true },
    { label: 'Daily diary mobile-first', procore: false, cubicost: false, ck: true },
    { label: '定價', procore: 'per seat USD', cubicost: 'per seat', ck: 'HK$3,800/月 per project' },
    { label: 'Apple 帳號刪除合規', procore: true, cubicost: 'N/A', ck: true },
  ]
  return (
    <Section n="05" kicker="我哋唔同人嘅地方" title="唔做你做開嘅 QS — 做你而家用 WhatsApp 做嘅嘢">
      <div className="overflow-x-auto rounded-2xl border border-site-200">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="text-left bg-site-50">
              <th className="py-4 px-5 font-mono text-xs uppercase tracking-wider text-site-400"></th>
              <th className="py-4 px-5 font-semibold text-site-500">Procore</th>
              <th className="py-4 px-5 font-semibold text-site-500">Cubicost</th>
              <th className="py-4 px-5 font-heading font-extrabold text-safety-700 bg-safety-50 border-x-2 border-safety-200">CK工程</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className={`border-t border-site-100 ${i % 2 ? 'bg-site-50/40' : ''}`}>
                <td className="py-4 px-5 font-semibold text-site-800">{r.label}</td>
                <Cell v={r.procore} />
                <Cell v={r.cubicost} />
                <Cell v={r.ck} highlight />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 font-heading text-lg md:text-xl font-bold text-site-900 text-center" style={{ textWrap: 'balance' } as React.CSSProperties}>
        「我哋唔做你做開嘅 QS。我哋做你而家用 WhatsApp 做嘅 stuff。」
      </p>
    </Section>
  )
}

function Cell({ v, highlight }: { v: boolean | string; highlight?: boolean }) {
  return (
    <td className={`py-4 px-5 ${highlight ? 'bg-safety-50 border-x-2 border-safety-200' : ''}`}>
      {v === true ? <Check size={18} className="text-green-600" /> :
       v === false ? <X size={18} className="text-site-300" /> :
       <span className={`text-xs ${highlight ? 'text-safety-700 font-bold' : 'text-site-600'}`}>{v}</span>}
    </td>
  )
}

// ── PRICING ─────────────────────────────────────────────────
function Pricing() {
  const tiers = [
    { name: 'Pilot 試用', price: 'HK$0', cycle: '1 個月', feats: ['1 個項目', '10 個帳號', '全部 v1.1 功能'], cta: '免費開始', href: APP_STORE },
    { name: 'Standard', price: 'HK$3,800', cycle: '/月 per project', feats: ['1 個項目', '50 個帳號', '10 GB 圖則', '每月 1 份自訂報告'], cta: '立即試用', href: APP_STORE, highlight: true },
    { name: 'Pro', price: 'HK$9,800', cycle: '/月 無限項目', feats: ['無限項目', '無限帳號', '100 GB 圖則', '每月 review call'], cta: '聯絡我哋', href: `mailto:${EMAIL}` },
    { name: 'Enterprise', price: 'Quote', cycle: '年度合約', feats: ['專屬客戶經理', 'HK 區數據', '99.9% SLA + DPA'], cta: '聯絡我哋', href: `mailto:${EMAIL}` },
  ]
  return (
    <Section n="06" kicker="越多 project 越平" title="所有 tier 都包 v1.1 security + UX，唔係 paywall" tone="dark" id="pricing">
      <div className="grid md:grid-cols-4 gap-5">
        {tiers.map(t => (
          <div key={t.name} className={`relative rounded-2xl p-6 flex flex-col ${t.highlight ? 'bg-white text-site-900 shadow-2xl ring-2 ring-safety-500 md:-translate-y-3' : 'bg-white/[0.03] border border-white/10 text-white'}`}>
            {t.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-safety-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">最受歡迎</div>
            )}
            <div className={`font-heading font-bold ${t.highlight ? 'text-site-900' : 'text-white'}`}>{t.name}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={`font-heading text-3xl font-extrabold tabular-nums ${t.highlight ? 'text-safety-600' : 'text-white'}`}>{t.price}</span>
            </div>
            <div className={`text-xs ${t.highlight ? 'text-site-500' : 'text-site-400'}`}>{t.cycle}</div>
            <ul className="mt-5 space-y-2.5 flex-1">
              {t.feats.map(f => (
                <li key={f} className={`flex items-start gap-2 text-sm ${t.highlight ? 'text-site-700' : 'text-site-300'}`}>
                  <Check size={15} className="text-safety-500 flex-shrink-0 mt-0.5" /> {f}
                </li>
              ))}
            </ul>
            <a href={t.href} target="_blank" rel="noreferrer"
               className={`mt-6 text-center text-sm font-semibold px-4 py-3 rounded-xl transition ${t.highlight ? 'bg-safety-500 hover:bg-safety-600 text-white' : 'border border-white/20 hover:bg-white/5 text-white'}`}>
              {t.cta}
            </a>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl overflow-hidden">
        <div className="h-1.5 w-full" style={HAZARD} />
        <div className="bg-safety-500 text-white p-6 text-center">
          <div className="font-heading text-xl md:text-2xl font-extrabold">創始客戶價 — HK$2,850/月</div>
          <div className="text-sm text-white/90 mt-1 font-mono">鎖 12 個月 · 2026-06-30 前簽 · Standard 慳 25%</div>
        </div>
      </div>
    </Section>
  )
}

// ── ROI ─────────────────────────────────────────────────────
function Roi() {
  const rows = [
    { item: 'PM 追 daily report 時間', save: 'HK$112,500' },
    { item: '冇 paper trail 輸咗嘅 dispute', save: 'HK$50,000' },
    { item: '新 foreman onboarding', save: 'HK$19,800' },
    { item: '太遲發現嘅物料延誤', save: 'HK$15,000' },
  ]
  return (
    <Section n="07" kicker="小型 GC · 1 個地盤 · 5 人" title="年費 HK$45,600，省返 HK$197,300">
      <div className="max-w-2xl mx-auto rounded-2xl border border-site-200 overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.item} className={`border-b border-site-100 ${i % 2 ? 'bg-site-50/40' : ''}`}>
                <td className="py-4 px-5 text-site-700">{r.item}</td>
                <td className="py-4 px-5 text-right font-mono font-semibold text-green-700 tabular-nums">{r.save}</td>
              </tr>
            ))}
            <tr className="bg-site-950 text-white">
              <td className="py-4 px-5 font-bold">每年總慳</td>
              <td className="py-4 px-5 text-right font-heading font-extrabold text-safety-500 text-lg tabular-nums">HK$197,300</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-5 text-center font-mono text-sm text-site-500">第一年 <span className="text-safety-600 font-bold">4.3x ROI</span> · 淨慳 HK$151,700</p>
    </Section>
  )
}

// ── TRUST ───────────────────────────────────────────────────
function Trust() {
  const bullets = [
    'Apple App Store 已通過 review（v1.1 自 5/27）',
    'Google Play 已通過 closed test review',
    '5-persona security simulation，25/25 attack vectors blocked',
    'Apple 帳號刪除合規（soft-anonymize）',
    'Data 加密：at rest (Supabase) + in transit (HTTPS only)',
    'PDPO compliant · 數據預設 Singapore region',
  ]
  return (
    <Section n="08" kicker="點解你可以信我哋" title={<>Dispute 嘅時候，你唔需要靠記性</>} tone="dark">
      <div className="grid md:grid-cols-2 gap-3 max-w-3xl mx-auto">
        {bullets.map(b => (
          <div key={b} className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3.5">
            <ShieldCheck size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-site-200">{b}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── LEAD CAPTURE ────────────────────────────────────────────
function LeadCapture() {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const valid = name.trim() && contact.trim()

  async function submit() {
    if (!valid) return
    setSending(true); setErr(null)
    const { error } = await supabase.from('leads').insert({
      name: name.trim(), company: company.trim(), contact: contact.trim(),
      message: message.trim(), source: 'sell',
    })
    setSending(false)
    if (error) setErr('提交失敗，請直接 WhatsApp / email 我哋。')
    else setDone(true)
  }

  return (
    <section id="trial" className="relative bg-site-950 text-white py-16 md:py-24 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={GRID_DARK} />
      <div className="absolute -bottom-32 -left-32 w-[32rem] h-[32rem] rounded-full bg-safety-500/15 blur-[120px] pointer-events-none" />
      <div className="relative max-w-xl mx-auto px-5 md:px-8">
        <div className="text-center mb-10">
          <div className="flex items-center gap-2 justify-center mb-3">
            <span className="font-mono text-xs font-bold text-safety-500 tracking-widest">10</span>
            <span className="h-px w-8 bg-safety-500" />
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-site-400">1 個月免費試用</span>
          </div>
          <h2 className="font-heading text-3xl md:text-4xl font-extrabold tracking-tight">留低聯絡，我哋當日搵你</h2>
          <p className="mt-4 inline-block rounded-full bg-safety-500/10 ring-1 ring-safety-500/30 text-safety-300 text-sm px-4 py-2 font-mono">
            預約即享 <span className="text-white font-bold">1 個月免費試用</span> · 我哋幫你 set 好一個 zone
          </p>
          <p className="mt-3 text-xs text-site-400">6 月 30 號前簽，鎖創始價 HK$2,850/月（Standard 慳 25%）</p>
        </div>

        {done ? (
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 text-center py-12 px-6">
            <div className="w-14 h-14 rounded-full bg-green-500/15 ring-1 ring-green-500/30 text-green-400 grid place-items-center mx-auto mb-4">
              <Check size={28} />
            </div>
            <div className="font-heading text-xl font-bold text-white">收到！</div>
            <p className="text-sm text-site-300 mt-1.5">我哋會喺一個工作日內聯絡你安排 pilot。</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-6 md:p-8 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="你嘅名 *" value={name} onChange={setName} placeholder="陳大文" />
              <Field label="公司 / 工程" value={company} onChange={setCompany} placeholder="XX 建築" />
            </div>
            <Field label="聯絡方法 * (電話 / WhatsApp / email)" value={contact} onChange={setContact} placeholder="9123 4567" />
            <label className="block">
              <div className="text-xs font-mono uppercase tracking-wider text-site-400 mb-1.5">想了解啲咩？(可選)</div>
              <textarea
                className="w-full rounded-xl bg-site-900 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-site-500 focus:border-safety-500 focus:ring-1 focus:ring-safety-500 outline-none transition"
                rows={3} value={message} onChange={e => setMessage(e.target.value)}
                placeholder="例如：想睇 demo / 想知幾錢 / 有幾個地盤想試"
              />
            </label>
            {err && <div className="text-sm text-red-400">{err}</div>}
            <button onClick={submit} disabled={!valid || sending}
              className="w-full bg-safety-500 hover:bg-safety-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 transition shadow-[0_8px_30px_-8px_rgba(249,115,22,0.7)]">
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} 申請免費試用
            </button>
            <p className="text-xs text-site-500 text-center font-mono">提交即表示同意我哋就 pilot 事宜聯絡你。我哋唔會賣你嘅資料。</p>
          </div>
        )}
      </div>
    </section>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <label className="block">
      <div className="text-xs font-mono uppercase tracking-wider text-site-400 mb-1.5">{label}</div>
      <input
        className="w-full rounded-xl bg-site-900 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-site-500 focus:border-safety-500 focus:ring-1 focus:ring-safety-500 outline-none transition"
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      />
    </label>
  )
}

// ── CLOSE CTA ───────────────────────────────────────────────
function CloseCta() {
  return (
    <section className="relative bg-safety-500 text-white py-16 md:py-20 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #000 0 20px, transparent 20px 40px)' }} />
      <div className="relative max-w-2xl mx-auto px-5 md:px-8 text-center">
        <h2 className="font-heading text-3xl md:text-4xl font-extrabold tracking-tight">下一步</h2>
        <p className="mt-3 text-white/90">想試？想 demo？想直接傾價？揀一個。</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="#trial" className="bg-site-950 text-white px-6 py-3.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-site-900 transition">
            <Smartphone size={18} /> 免費 30 日試用
          </a>
          <a href={`mailto:${EMAIL}?subject=CK工程 demo 預約`} className="bg-white text-site-900 px-6 py-3.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-site-50 transition">
            <Mail size={18} /> 預約 demo
          </a>
          <Link to="/takeaway" className="border border-white/40 text-white px-6 py-3.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-white/10 transition">
            <FileDown size={18} /> 1 頁價目表
          </Link>
        </div>
        <div className="mt-7 text-sm text-white/90 font-mono">
          {EMAIL} · WhatsApp 隨時
        </div>
      </div>
    </section>
  )
}

// ── FOOTER ──────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-site-950 border-t border-white/10 py-10">
      <div className="max-w-6xl mx-auto px-5 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-site-400">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-safety-500 text-white grid place-items-center text-xs font-heading font-bold">CK</div>
          <span className="text-site-300">CK工程 / Construction App</span>
        </div>
        <div className="flex items-center gap-5 font-mono text-xs">
          <a href={APP_STORE} target="_blank" rel="noreferrer" className="hover:text-white transition">iOS</a>
          <a href={PLAY_STORE} target="_blank" rel="noreferrer" className="hover:text-white transition">Android</a>
          <a href={WEB_APP} target="_blank" rel="noreferrer" className="hover:text-white transition">Web</a>
          <Link to="/mission" className="hover:text-white transition">Mission</Link>
        </div>
      </div>
    </footer>
  )
}
