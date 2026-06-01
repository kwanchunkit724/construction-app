import { Link } from 'react-router-dom'
import {
  Smartphone, Globe, MessageSquareOff, FileWarning, FileSpreadsheet,
  HardHat, ClipboardCheck, LayoutDashboard, Clock, ShieldCheck, Check, X,
  ArrowRight, Mail, FileDown, Rocket,
} from 'lucide-react'

// Public sales landing page at /#/sell. No auth, no providers required.
// Built from .planning/sales-kit/ (positioning + 04 pitch + 06 pricing).
// Mobile-first (390px) → desktop. zh-HK throughout.

const APP_STORE = 'https://apps.apple.com/app/id6764754372'
const PLAY_STORE = 'https://play.google.com/apps/testing/com.kwanchunkit.constructionapp'
const WEB_APP = 'https://construction-app-lime-six.vercel.app'
const EMAIL = 'kck980724@gmail.com'

export default function SellPage() {
  return (
    <div className="min-h-screen bg-white text-site-900 font-sans">
      <Nav />
      <Hero />
      <Pain />
      <Numbers />
      <Solution />
      <HowItWorks />
      <Compare />
      <Pricing />
      <Roi />
      <Trust />
      <CloseCta />
      <Footer />
    </div>
  )
}

// ── NAV ─────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-site-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-safety-500 text-white grid place-items-center font-bold flex-shrink-0">CK</div>
          <div className="font-heading font-semibold">CK工程</div>
        </div>
        <div className="flex items-center gap-2">
          <a href="#pricing" className="hidden sm:inline text-sm text-site-600 hover:text-site-900 px-3 py-1.5">定價</a>
          <a href={APP_STORE} target="_blank" rel="noreferrer" className="btn-primary text-xs sm:text-sm px-3 py-1.5">
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
    <section className="relative overflow-hidden bg-gradient-to-b from-site-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-14 md:py-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium bg-safety-100 text-safety-700 rounded-full px-3 py-1 mb-5">
            <Rocket size={13} /> iOS App Store 已上架 · Android 測試中
          </div>
          <h1 className="font-heading text-3xl md:text-5xl leading-tight font-bold">
            取代地盤嘅<br />
            <span className="text-safety-600">WhatsApp + Excel + 紙簿</span>
          </h1>
          <p className="mt-5 text-base md:text-lg text-site-600 leading-relaxed">
            判頭、工程師、PM 一齊喺同一個 app 寫每日進度、報問題、申請物料、簽 PTW。
            出 dispute 嗰時，每一個 action 都有時間戳同 audit trail。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href={APP_STORE} target="_blank" rel="noreferrer" className="btn-primary px-5 py-3 flex items-center gap-2">
              <Smartphone size={18} /> 下載 iOS App
            </a>
            <a href={WEB_APP} target="_blank" rel="noreferrer" className="btn-ghost px-5 py-3 flex items-center gap-2">
              <Globe size={18} /> 即開 Web 版
            </a>
          </div>
          <div className="mt-4 text-sm text-site-500">1 個月試用 <strong className="text-site-700">HK$0</strong> · 無需信用卡 · zh-HK 介面</div>
        </div>

        {/* Phone mock */}
        <div className="flex justify-center md:justify-end">
          <div className="w-[260px] rounded-[2rem] border-8 border-site-900 bg-site-900 shadow-card-md overflow-hidden">
            <div className="bg-white">
              <div className="bg-safety-500 text-white px-4 py-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white/20 grid place-items-center text-xs font-bold">CK</div>
                <div className="text-sm font-medium">DC2026 油塘住宅</div>
              </div>
              <div className="p-3 space-y-2">
                {[
                  { z: 'N座', t: '結構工程', p: 72, c: 'bg-green-500' },
                  { z: 'S座', t: '機電安裝', p: 45, c: 'bg-blue-500' },
                  { z: '地庫', t: '防水工程', p: 88, c: 'bg-safety-500' },
                ].map(r => (
                  <div key={r.z} className="rounded-lg border border-site-200 p-2.5">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-medium text-site-800"><span className="text-safety-600">[{r.z}]</span> {r.t}</span>
                      <span className="text-site-500">{r.p}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-site-100 overflow-hidden">
                      <div className={`h-full ${r.c}`} style={{ width: `${r.p}%` }} />
                    </div>
                  </div>
                ))}
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 flex items-center gap-2">
                  <span className="text-xs font-medium text-red-600">急件</span>
                  <span className="text-xs text-site-700">接駁管 — 等緊批</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── PAIN ────────────────────────────────────────────────────
function Pain() {
  const items = [
    { icon: <MessageSquareOff size={22} />, t: 'WhatsApp', d: '揾唔到上個月 02 號邊個簽嘅 PTW。200 條未讀，問題沉晒底。' },
    { icon: <FileWarning size={22} />, t: '紙簿', d: '落雨整濕、塵蓋住、收唔到 office。out dispute 揾唔返。' },
    { icon: <FileSpreadsheet size={22} />, t: 'Excel', d: 'PM 用緊 v3 final FINAL，foreman 用緊 v1。冇人知邊個啱。' },
  ]
  return (
    <Section tone="muted">
      <SectionHead kicker="今日嘅地盤現實" title="資料散晒，dispute 嗰時靠記性" />
      <div className="grid md:grid-cols-3 gap-4">
        {items.map(i => (
          <div key={i.t} className="card">
            <div className="w-11 h-11 rounded-xl bg-red-50 text-red-500 grid place-items-center mb-3">{i.icon}</div>
            <div className="font-heading font-semibold text-lg">{i.t}</div>
            <p className="mt-1.5 text-sm text-site-600 leading-relaxed">{i.d}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── NUMBERS ─────────────────────────────────────────────────
function Numbers() {
  const stats = [
    { n: '2 小時/日', d: 'PM 花喺追 foreman 嘅 daily report' },
    { n: '45%', d: 'site issues 升級之後先發現' },
    { n: 'HK$50,000', d: '平均一單 dispute settlement（行業估算）' },
  ]
  return (
    <Section>
      <SectionHead kicker="呢個 cost 你幾錢" title="每個鐘 PM 唔知地盤點，就係 dispute 嘅土壤" />
      <div className="grid md:grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.n} className="text-center p-6 rounded-2xl bg-site-50 border border-site-200">
            <div className="font-heading text-3xl md:text-4xl font-bold text-safety-600">{s.n}</div>
            <div className="mt-2 text-sm text-site-600">{s.d}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── SOLUTION ────────────────────────────────────────────────
function Solution() {
  const cols = [
    {
      icon: <HardHat size={22} />, role: '判頭',
      points: ['物料 request + 急件 alert', '逾期 / 吹大水即時知', '自動 link 進度項目'],
    },
    {
      icon: <ClipboardCheck size={22} />, role: '工程師 / 管工',
      points: ['30 秒 daily report', 'PTW 電子簽 + 拎相', '焊接 / 棚架全部 PTW'],
    },
    {
      icon: <LayoutDashboard size={22} />, role: '老總 / PM',
      points: ['Real-time 4-zone dashboard', 'Audit trail for dispute', '自動 escalation chain'],
    },
  ]
  return (
    <Section tone="dark">
      <SectionHead kicker="一個 app，三個角色" title="全部 audit trail" invert />
      <div className="grid md:grid-cols-3 gap-4">
        {cols.map(c => (
          <div key={c.role} className="rounded-2xl bg-white/5 border border-white/10 p-5">
            <div className="w-11 h-11 rounded-xl bg-safety-500 text-white grid place-items-center mb-3">{c.icon}</div>
            <div className="font-heading font-semibold text-lg text-white">{c.role}</div>
            <ul className="mt-3 space-y-2">
              {c.points.map(p => (
                <li key={p} className="flex items-start gap-2 text-sm text-site-200">
                  <Check size={16} className="text-safety-400 flex-shrink-0 mt-0.5" /> {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-site-300">每一個 click 都有 timestamp + user 簽名</p>
    </Section>
  )
}

// ── HOW IT WORKS ────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { time: '9am', d: '判頭喺 app 申請物料（急件 toggle）→ 老總即收 push notification' },
    { time: '2pm', d: 'Foreman 喺手機 update 進度 60% → office 即見' },
    { time: '6pm', d: 'PM 一鍵 export 今日 PDF → 俾 owner / 加入 dispute file' },
  ]
  return (
    <Section>
      <SectionHead kicker="早 9am 到晚 6pm" title="3 個步驟，WhatsApp 唔再需要做 ops" />
      <div className="grid md:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <div key={s.time} className="relative card">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={18} className="text-safety-600" />
              <span className="font-heading font-bold text-xl">{s.time}</span>
            </div>
            <p className="text-sm text-site-600 leading-relaxed">{s.d}</p>
            {i < steps.length - 1 && (
              <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-site-300" size={20} />
            )}
          </div>
        ))}
      </div>
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
    <Section tone="muted">
      <SectionHead kicker="我哋唔同人嘅地方" title="唔做你做開嘅 QS — 做你而家用 WhatsApp 做嘅嘢" />
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-site-200 text-left">
              <th className="py-3 px-4 font-medium text-site-500"></th>
              <th className="py-3 px-4 font-medium text-site-500">Procore</th>
              <th className="py-3 px-4 font-medium text-site-500">Cubicost</th>
              <th className="py-3 px-4 font-semibold text-safety-700 bg-safety-50">CK工程</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-site-100 last:border-0">
                <td className="py-3 px-4 font-medium text-site-800">{r.label}</td>
                <Cell v={r.procore} />
                <Cell v={r.cubicost} />
                <Cell v={r.ck} highlight />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Cell({ v, highlight }: { v: boolean | string; highlight?: boolean }) {
  return (
    <td className={`py-3 px-4 ${highlight ? 'bg-safety-50' : ''}`}>
      {v === true ? <Check size={18} className="text-green-600" /> :
       v === false ? <X size={18} className="text-site-300" /> :
       <span className={`text-xs ${highlight ? 'text-safety-700 font-medium' : 'text-site-600'}`}>{v}</span>}
    </td>
  )
}

// ── PRICING ─────────────────────────────────────────────────
function Pricing() {
  const tiers = [
    { name: 'Pilot 試用', price: 'HK$0', cycle: '1 個月', feats: ['1 個項目', '10 個帳號', '全部 v1.1 功能'], cta: '免費開始' },
    { name: 'Standard', price: 'HK$3,800', cycle: '/月 per project', feats: ['1 個項目', '50 個帳號', '10 GB 圖則', '每月 1 份自訂報告'], cta: '立即試用', highlight: true },
    { name: 'Pro', price: 'HK$9,800', cycle: '/月 無限項目', feats: ['無限項目', '無限帳號', '100 GB 圖則', '每月 review call'], cta: '聯絡我哋' },
    { name: 'Enterprise', price: 'Quote', cycle: '年度合約', feats: ['專屬客戶經理', 'HK 區數據', '99.9% SLA + DPA'], cta: '聯絡我哋' },
  ]
  return (
    <Section id="pricing">
      <SectionHead kicker="越多 project 越平" title="所有 tier 都包 v1.1 security + UX，唔係 paywall" />
      <div className="grid md:grid-cols-4 gap-4">
        {tiers.map(t => (
          <div key={t.name} className={`rounded-2xl p-5 border flex flex-col ${t.highlight ? 'border-safety-400 bg-safety-50 shadow-card-md' : 'border-site-200 bg-white'}`}>
            {t.highlight && <div className="text-xs font-medium text-safety-700 mb-1">最受歡迎</div>}
            <div className="font-heading font-semibold">{t.name}</div>
            <div className="mt-2 font-heading text-2xl font-bold">{t.price}</div>
            <div className="text-xs text-site-500">{t.cycle}</div>
            <ul className="mt-4 space-y-2 flex-1">
              {t.feats.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-site-700">
                  <Check size={15} className="text-safety-600 flex-shrink-0 mt-0.5" /> {f}
                </li>
              ))}
            </ul>
            <a href={t.name === 'Pilot 試用' || t.highlight ? APP_STORE : `mailto:${EMAIL}`}
               target="_blank" rel="noreferrer"
               className={`mt-5 text-center text-sm px-4 py-2.5 rounded-xl font-medium ${t.highlight ? 'btn-primary' : 'btn-ghost'}`}>
              {t.cta}
            </a>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl bg-gradient-to-r from-safety-500 to-safety-600 text-white p-5 text-center">
        <div className="font-heading font-semibold">創始客戶價 — HK$2,850/月</div>
        <div className="text-sm text-white/90 mt-1">鎖 12 個月 · 2026-06-30 前簽。Standard 慳 25%。</div>
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
    <Section tone="muted">
      <SectionHead kicker="小型 GC · 1 個地盤 · 5 人" title="年費 HK$45,600，省返 HK$197,300" />
      <div className="card max-w-2xl mx-auto p-0 overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(r => (
              <tr key={r.item} className="border-b border-site-100">
                <td className="py-3 px-4 text-site-700">{r.item}</td>
                <td className="py-3 px-4 text-right font-medium text-green-700">{r.save}</td>
              </tr>
            ))}
            <tr className="bg-safety-50">
              <td className="py-3 px-4 font-semibold text-site-900">每年總慳</td>
              <td className="py-3 px-4 text-right font-heading font-bold text-safety-700">HK$197,300</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-center text-sm text-site-500">第一年 <strong className="text-site-700">4.3x ROI</strong> · 淨慳 HK$151,700</p>
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
    <Section>
      <SectionHead kicker="點解你可以信我哋" title="Dispute 嘅時候，你唔需要靠記性" />
      <div className="grid md:grid-cols-2 gap-3 max-w-3xl mx-auto">
        {bullets.map(b => (
          <div key={b} className="flex items-start gap-2.5 card">
            <ShieldCheck size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-site-700">{b}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── CLOSE CTA ───────────────────────────────────────────────
function CloseCta() {
  return (
    <Section tone="dark">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="font-heading text-2xl md:text-3xl font-bold text-white">下一步</h2>
        <p className="mt-3 text-site-300">想試？想 demo？想直接傾價？揀一個。</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <a href={APP_STORE} target="_blank" rel="noreferrer" className="btn-primary px-5 py-3 flex items-center gap-2">
            <Smartphone size={18} /> 免費 30 日試用
          </a>
          <a href={`mailto:${EMAIL}?subject=CK工程 demo 預約`} className="bg-white text-site-900 px-5 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-site-100">
            <Mail size={18} /> 預約 30 分鐘 demo
          </a>
          <Link to="/takeaway" className="border border-white/30 text-white px-5 py-3 rounded-xl font-medium flex items-center gap-2 hover:bg-white/10">
            <FileDown size={18} /> 1 頁價目表
          </Link>
        </div>
        <div className="mt-6 text-sm text-site-400">
          Email <a href={`mailto:${EMAIL}`} className="text-safety-400 underline">{EMAIL}</a> · WhatsApp 隨時
        </div>
      </div>
    </Section>
  )
}

// ── FOOTER ──────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-site-200 py-8">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-site-500">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-safety-500 text-white grid place-items-center text-xs font-bold">CK</div>
          CK工程 / Construction App
        </div>
        <div className="flex items-center gap-4">
          <a href={APP_STORE} target="_blank" rel="noreferrer" className="hover:text-site-900">iOS</a>
          <a href={PLAY_STORE} target="_blank" rel="noreferrer" className="hover:text-site-900">Android</a>
          <a href={WEB_APP} target="_blank" rel="noreferrer" className="hover:text-site-900">Web</a>
          <Link to="/mission" className="hover:text-site-900">Mission</Link>
        </div>
      </div>
    </footer>
  )
}

// ── LAYOUT PRIMITIVES ───────────────────────────────────────
function Section({ children, tone = 'plain', id }: { children: React.ReactNode; tone?: 'plain' | 'muted' | 'dark'; id?: string }) {
  const bg = tone === 'dark' ? 'bg-site-900' : tone === 'muted' ? 'bg-site-50' : 'bg-white'
  return (
    <section id={id} className={`${bg} py-14 md:py-20`}>
      <div className="max-w-6xl mx-auto px-4">{children}</div>
    </section>
  )
}

function SectionHead({ kicker, title, invert }: { kicker: string; title: string; invert?: boolean }) {
  return (
    <div className="text-center mb-10 max-w-2xl mx-auto">
      <div className={`text-xs font-medium uppercase tracking-wide ${invert ? 'text-safety-400' : 'text-safety-600'}`}>{kicker}</div>
      <h2 className={`mt-2 font-heading text-2xl md:text-3xl font-bold ${invert ? 'text-white' : 'text-site-900'}`}>{title}</h2>
    </div>
  )
}
