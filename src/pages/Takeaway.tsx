import { Printer } from 'lucide-react'

// A4 print-optimized one-pager at /#/takeaway.
// User opens → 列印 → 另存 PDF → bring 10 copies to meetings.
// Top half: pricing. Bottom half: ROI + contact. zh-HK.

const EMAIL = 'kck980724@gmail.com'
const WEB_APP = 'https://construction-app-lime-six.vercel.app'

export default function TakeawayPage() {
  return (
    <div className="min-h-screen bg-site-100 py-6 print:bg-white print:py-0">
      {/* Print A4 sizing — screen shows a centered "paper", print fills the page. */}
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; }
        }
      `}</style>

      {/* Print bar (screen only) */}
      <div className="no-print max-w-[210mm] mx-auto px-4 mb-4 flex items-center justify-between">
        <div className="text-sm text-site-500">A4 一頁價目表 — 列印或另存 PDF</div>
        <button onClick={() => window.print()} className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
          <Printer size={16} /> 列印 / 存 PDF
        </button>
      </div>

      {/* The sheet */}
      <div className="sheet bg-white mx-auto w-[210mm] max-w-full p-[14mm] shadow-card-md text-site-900 print:p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-safety-500 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-safety-500 text-white grid place-items-center font-bold text-lg">CK</div>
            <div>
              <div className="font-heading text-xl font-bold">CK工程 / Construction App</div>
              <div className="text-xs text-site-500">取代地盤嘅 WhatsApp + Excel + 紙簿</div>
            </div>
          </div>
          <div className="text-right text-xs text-site-500">
            <div>iOS App Store 已上架</div>
            <div>Android 測試中</div>
          </div>
        </div>

        {/* Positioning */}
        <p className="mt-3 text-[13px] leading-relaxed text-site-700">
          判頭、工程師、PM 一齊喺同一個 app 寫每日進度、報問題、申請物料、簽 PTW。
          出 dispute 嗰時，每一個 action 都有時間戳同 audit trail。
        </p>

        {/* Pricing table */}
        <div className="mt-4">
          <div className="font-heading font-semibold text-sm mb-2 text-safety-700">定價（所有 tier 都包 v1.1 全部功能）</div>
          <table className="w-full text-[12px] border border-site-200">
            <thead>
              <tr className="bg-site-50 text-left">
                <th className="py-2 px-2 border-b border-site-200"></th>
                <th className="py-2 px-2 border-b border-site-200">Pilot</th>
                <th className="py-2 px-2 border-b border-site-200 bg-safety-50">Standard</th>
                <th className="py-2 px-2 border-b border-site-200">Pro</th>
                <th className="py-2 px-2 border-b border-site-200">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['HK$/月', '0', '3,800', '9,800', 'Quote'],
                ['項目數', '1', '1 per sub', '無限', '無限'],
                ['帳號', '10', '50', '無限', '無限'],
                ['圖則 storage', '1 GB', '10 GB', '100 GB', 'Custom'],
                ['自訂報告', '—', '1/月', '無限', '無限'],
                ['On-site 培訓', '—', '—', '1/季', '無限'],
              ].map((row, i) => (
                <tr key={i} className="border-b border-site-100">
                  <td className="py-1.5 px-2 font-medium text-site-600">{row[0]}</td>
                  <td className="py-1.5 px-2">{row[1]}</td>
                  <td className="py-1.5 px-2 bg-safety-50 font-medium">{row[2]}</td>
                  <td className="py-1.5 px-2">{row[3]}</td>
                  <td className="py-1.5 px-2">{row[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-[11px] text-safety-700 font-medium">
            ★ 創始客戶價 HK$2,850/月（鎖 12 個月，2026-06-30 前簽，Standard 慳 25%）
          </div>
        </div>

        {/* ROI */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="font-heading font-semibold text-sm mb-2 text-safety-700">ROI — 小型 GC，1 地盤，5 人</div>
            <table className="w-full text-[11.5px]">
              <tbody>
                {[
                  ['PM 追 daily 時間', 'HK$112,500'],
                  ['輸咗嘅 dispute', 'HK$50,000'],
                  ['Foreman onboarding', 'HK$19,800'],
                  ['物料延誤', 'HK$15,000'],
                ].map((r, i) => (
                  <tr key={i} className="border-b border-site-100">
                    <td className="py-1 text-site-700">{r[0]}</td>
                    <td className="py-1 text-right font-medium text-green-700">{r[1]}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 font-semibold">每年總慳</td>
                  <td className="py-1.5 text-right font-heading font-bold text-safety-700">HK$197,300</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-1 text-[11px] text-site-600">年費 HK$45,600 · 第一年 4.3x ROI · 淨慳 HK$151,700</div>
          </div>

          <div>
            <div className="font-heading font-semibold text-sm mb-2 text-safety-700">點解信我哋</div>
            <ul className="text-[11.5px] space-y-1 text-site-700">
              <li>✓ Apple App Store 已通過 review</li>
              <li>✓ Google Play closed test 已通過</li>
              <li>✓ 25/25 attack vectors blocked（自家 sim）</li>
              <li>✓ Apple 帳號刪除合規</li>
              <li>✓ 數據加密 at rest + in transit</li>
              <li>✓ PDPO compliant · Singapore region</li>
            </ul>
          </div>
        </div>

        {/* Contact footer */}
        <div className="mt-5 pt-3 border-t-2 border-safety-500 flex items-end justify-between">
          <div>
            <div className="font-heading font-semibold text-sm">立即試用 — 1 個月 HK$0</div>
            <div className="text-[12px] text-site-600 mt-0.5">Email：{EMAIL} · WhatsApp 隨時</div>
            <div className="text-[12px] text-site-600">Web：{WEB_APP}</div>
          </div>
          <div className="text-right text-[11px] text-site-400">
            <div>關春傑 Kwan Chun Kit</div>
            <div>CK工程</div>
          </div>
        </div>
      </div>
    </div>
  )
}
