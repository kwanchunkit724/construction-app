import { useState, useRef } from 'react'
import { ClipboardCheck, Plus, ListChecks, ChevronDown, ChevronUp, CheckCircle, Camera, Loader2, X } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useQC } from '../context/QCContext'
import type { NCR } from '../types'
import { uploadFile, ncrPhotoPath } from '../lib/storage'

type Tab = 'list' | 'raise' | 'checklist'

const SEV_STYLE: Record<string, string> = {
  minor: 'bg-yellow-100 text-yellow-700',
  major: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}
const SEV_ZH: Record<string, string> = { minor: '輕微', major: '主要', critical: '嚴重' }

const NCR_STATUS_STYLE: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  'corrective-action': 'bg-yellow-100 text-yellow-700',
  verification: 'bg-blue-100 text-blue-700',
  closed: 'bg-green-100 text-green-700',
}
const NCR_STATUS_ZH: Record<string, string> = {
  open: '未處理', 'corrective-action': '糾正行動中', verification: '驗證中', closed: '已關閉'
}

const CHECKLIST_ITEMS = [
  '鋼筋綁紮完成',
  '保護層厚度符合',
  '模板安全固定',
  '清潔模板底部',
  '水電預留位確認',
  '旁站工程師到位',
  '安全主任批准',
  '混凝土磅單準備',
  '外置振動棒準備',
  '清場完畢',
]

export default function QCApp() {
  const { user } = useAuth()
  const { currentProjectId } = useProgress()
  const { ncrs, raiseNCR, updateCorrectiveAction, closeNCR } = useQC()

  const [activeTab, setActiveTab] = useState<Tab>('list')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // NCR form
  const [ncrZone, setNcrZone] = useState('Zone A')
  const [ncrWorkItem, setNcrWorkItem] = useState('')
  const [ncrDescription, setNcrDescription] = useState('')
  const [ncrSeverity, setNcrSeverity] = useState<NCR['severity']>('minor')
  const [ncrDueDate, setNcrDueDate] = useState('')
  const [ncrPhotos, setNcrPhotos] = useState<string[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [ncrSubmitted, setNcrSubmitted] = useState(false)

  // Corrective action modal
  const [caModalId, setCaModalId] = useState<string | null>(null)
  const [caAction, setCaAction] = useState('')
  const [caDueDate, setCaDueDate] = useState('')

  // Checklist
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const allChecked = CHECKLIST_ITEMS.every(item => checked[item])

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setPhotoUploading(true)
    const urls = await Promise.all(
      files.map(file => uploadFile(file, ncrPhotoPath(currentProjectId, file.name)))
    )
    const valid = urls.filter(Boolean) as string[]
    setNcrPhotos(prev => [...prev, ...valid])
    setPhotoUploading(false)
    e.target.value = ''
  }

  const handleRaiseNCR = () => {
    if (!ncrWorkItem.trim() || !ncrDescription.trim() || !user) return
    raiseNCR({
      projectId: currentProjectId,
      date: new Date().toISOString().slice(0, 10),
      raisedBy: user.id,
      raisedByName: user.name,
      zone: ncrZone,
      workItem: ncrWorkItem.trim(),
      description: ncrDescription.trim(),
      severity: ncrSeverity,
      photos: ncrPhotos,
      correctiveDueDate: ncrDueDate || undefined,
    })
    setNcrWorkItem(''); setNcrDescription(''); setNcrSeverity('minor'); setNcrDueDate('')
    setNcrPhotos([])
    setNcrSubmitted(true)
  }

  const handleUpdateCA = () => {
    if (!caModalId || !caAction.trim() || !user) return
    updateCorrectiveAction(caModalId, caAction.trim(), caDueDate, user.name)
    setCaModalId(null); setCaAction(''); setCaDueDate('')
  }

  const tabs = [
    { id: 'list' as Tab, label: 'NCR清單', icon: ClipboardCheck, badge: ncrs.filter(n => n.status !== 'closed').length },
    { id: 'raise' as Tab, label: '發起NCR', icon: Plus },
    { id: 'checklist' as Tab, label: '澆築前檢查', icon: ListChecks },
  ]

  return (
    <div className="min-h-screen bg-cyan-50">
      <Navbar accentColor="bg-cyan-600" bgColor="bg-cyan-800" />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="grid grid-flow-col auto-cols-fr border-b border-gray-100">
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors flex-1 justify-center ${
                    isActive ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  <Icon size={15} />
                  {tab.label}
                  {'badge' in tab && (tab as { badge: number }).badge > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActive ? 'bg-cyan-100 text-cyan-700' : 'bg-gray-100 text-gray-500'}`}>
                      {(tab as { badge: number }).badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {/* ===== NCR LIST ===== */}
            {activeTab === 'list' && (
              <div>
                <h2 className="font-semibold text-gray-800 mb-4">不合格報告 (NCR) 清單</h2>
                {ncrs.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <ClipboardCheck size={40} className="mx-auto mb-3 opacity-30" />
                    <p>暫無 NCR 記錄</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ncrs.map(ncr => (
                      <div key={ncr.id} className="border border-gray-100 rounded-xl overflow-hidden">
                        <div
                          className="p-4 cursor-pointer hover:bg-gray-50 flex items-start justify-between gap-2"
                          onClick={() => setExpandedId(expandedId === ncr.id ? null : ncr.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-mono text-xs text-gray-500">{ncr.ncrNo}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEV_STYLE[ncr.severity]}`}>{SEV_ZH[ncr.severity]}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${NCR_STATUS_STYLE[ncr.status]}`}>{NCR_STATUS_ZH[ncr.status]}</span>
                            </div>
                            <p className="font-semibold text-gray-800">{ncr.workItem}</p>
                            <div className="flex gap-3 text-xs text-gray-500 mt-1">
                              <span>📍 {ncr.zone}</span>
                              <span>📅 {ncr.date}</span>
                              <span>👤 {ncr.raisedByName}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {ncr.status !== 'closed' && (
                              <button onClick={e => { e.stopPropagation(); closeNCR(ncr.id) }}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-lg transition-colors">
                                關閉
                              </button>
                            )}
                            {expandedId === ncr.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                          </div>
                        </div>
                        {expandedId === ncr.id && (
                          <div className="px-4 pb-4 pt-0 border-t border-gray-100 bg-gray-50 space-y-3">
                            <div>
                              <p className="text-xs text-gray-500 mb-1">問題描述</p>
                              <p className="text-sm text-gray-800">{ncr.description}</p>
                            </div>
                            {ncr.photos.length > 0 && (
                              <div>
                                <p className="text-xs text-gray-500 mb-1.5">📷 現場照片 ({ncr.photos.length})</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {ncr.photos.map((src, idx) => (
                                    <a key={idx} href={src} target="_blank" rel="noopener noreferrer">
                                      <img src={src} alt={`photo-${idx + 1}`} className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity" />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {ncr.correctiveAction ? (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-yellow-800 mb-1">糾正行動</p>
                                <p className="text-sm text-yellow-700">{ncr.correctiveAction}</p>
                                {ncr.correctiveDueDate && <p className="text-xs text-yellow-600 mt-1">截止日期：{ncr.correctiveDueDate}</p>}
                              </div>
                            ) : (
                              ncr.status === 'open' && (
                                <button onClick={e => { e.stopPropagation(); setCaModalId(ncr.id); setCaAction(''); setCaDueDate('') }}
                                  className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                                  新增糾正行動
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== RAISE NCR ===== */}
            {activeTab === 'raise' && (
              <div className="max-w-lg">
                <h2 className="font-semibold text-gray-800 mb-4">發起不合格報告 (NCR)</h2>

                {ncrSubmitted && (
                  <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 space-y-2">
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle size={18} className="flex-shrink-0" /> NCR 已成功發起
                    </div>
                    <div className="text-xs text-green-600 space-y-1 pl-6">
                      <p>📧 已通知：<strong>張志豪（工程師）</strong>、<strong>麥偉強（工頭）</strong></p>
                      <p>📋 NCR 編號已生成，可在「NCR清單」查看狀態</p>
                      <p>⏰ 請在指定期限內跟進糾正行動</p>
                    </div>
                    <button onClick={() => setNcrSubmitted(false)} className="text-xs text-green-700 hover:underline pl-6">再發起</button>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">區域</label>
                      <select value={ncrZone} onChange={e => setNcrZone(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400">
                        {['Zone A','Zone B','Zone C','Zone D','Zone E','Zone F','Zone G'].map(z => <option key={z}>{z}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">截止日期 (選填)</label>
                      <input type="date" value={ncrDueDate} onChange={e => setNcrDueDate(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">工作項目 *</label>
                    <input value={ncrWorkItem} onChange={e => setNcrWorkItem(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                      placeholder="例：鋼筋綁紮、混凝土澆築" />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">嚴重程度</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['minor','major','critical'] as const).map(s => (
                        <button key={s} onClick={() => setNcrSeverity(s)}
                          className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                            ncrSeverity === s
                              ? s === 'critical' ? 'border-red-500 bg-red-50 text-red-700'
                              : s === 'major' ? 'border-orange-500 bg-orange-50 text-orange-700'
                              : 'border-yellow-400 bg-yellow-50 text-yellow-700'
                              : 'border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}>{SEV_ZH[s]}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">問題描述 *</label>
                    <textarea rows={4} value={ncrDescription} onChange={e => setNcrDescription(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 resize-none"
                      placeholder="詳細描述不合格項目..." />
                  </div>

                  {/* Photo upload */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">現場照片 (選填)</label>
                    <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
                    <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
                      className="w-full border-2 border-dashed border-gray-200 hover:border-cyan-400 hover:bg-cyan-50 rounded-xl p-4 text-center transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                      {photoUploading
                        ? <><Loader2 size={16} className="animate-spin text-cyan-500" /><span className="text-sm text-gray-500">上傳中…</span></>
                        : <><Camera size={16} className="text-cyan-500" /><span className="text-sm text-gray-500">{ncrPhotos.length > 0 ? `已上傳 ${ncrPhotos.length} 張` : '上傳照片'}</span></>
                      }
                    </button>
                    {ncrPhotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5 mt-2">
                        {ncrPhotos.map((src, idx) => (
                          <div key={idx} className="relative aspect-square">
                            <img src={src} alt={`ncr-${idx + 1}`} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                            <button onClick={() => setNcrPhotos(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600">
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={handleRaiseNCR} disabled={!ncrWorkItem.trim() || !ncrDescription.trim() || photoUploading}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white py-3 rounded-xl text-sm font-bold transition-colors">
                    發起 NCR
                  </button>
                </div>
              </div>
            )}

            {/* ===== CHECKLIST ===== */}
            {activeTab === 'checklist' && (
              <div className="max-w-lg">
                <h2 className="font-semibold text-gray-800 mb-1">澆築前質量檢查清單</h2>
                <p className="text-xs text-gray-400 mb-5">所有項目確認完畢方可批准澆築</p>

                {allChecked && (
                  <div className="mb-5 border-2 border-green-400 rounded-2xl overflow-hidden">
                    <div className="bg-green-500 px-4 py-3 flex items-center gap-3">
                      <CheckCircle size={22} className="text-white flex-shrink-0" />
                      <p className="text-white font-bold">所有項目已確認 — 批准澆築</p>
                    </div>
                    <div className="bg-green-50 px-4 py-3 text-xs text-green-800 space-y-1">
                      <div className="flex justify-between font-semibold border-b border-green-200 pb-2 mb-2">
                        <span>澆築前質量批准書</span>
                        <span>{new Date().toISOString().slice(0,10)} {new Date().toTimeString().slice(0,5)}</span>
                      </div>
                      {CHECKLIST_ITEMS.map((item, i) => (
                        <div key={item} className="flex items-center gap-2">
                          <CheckCircle size={11} className="text-green-600 flex-shrink-0" />
                          <span>{i + 1}. {item}</span>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-green-200 mt-2 flex justify-between text-green-700">
                        <span>質檢員：{user?.name}</span>
                        <span className="font-semibold">✓ 批准澆築</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {CHECKLIST_ITEMS.map((item, i) => (
                    <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      checked[item] ? 'border-green-400 bg-green-50' : 'border-gray-100 bg-white hover:border-cyan-300'
                    }`}>
                      <input type="checkbox" checked={!!checked[item]}
                        onChange={e => setChecked(prev => ({ ...prev, [item]: e.target.checked }))}
                        className="w-5 h-5 accent-green-600 flex-shrink-0" />
                      <span className={`text-sm font-medium ${checked[item] ? 'text-green-700 line-through' : 'text-gray-800'}`}>
                        {i + 1}. {item}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                  <span>已確認 {Object.values(checked).filter(Boolean).length} / {CHECKLIST_ITEMS.length} 項</span>
                  <button onClick={() => setChecked({})} className="text-xs text-red-500 hover:underline">重置</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Corrective action modal */}
      {caModalId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4">新增糾正行動</h3>
            <div className="mb-3">
              <label className="text-sm font-medium text-gray-700 mb-1 block">糾正行動描述 *</label>
              <textarea rows={3} value={caAction} onChange={e => setCaAction(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 resize-none"
                placeholder="描述需要採取的糾正行動..." />
            </div>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1 block">截止日期</label>
              <input type="date" value={caDueDate} onChange={e => setCaDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCaModalId(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button onClick={handleUpdateCA} disabled={!caAction.trim()}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
