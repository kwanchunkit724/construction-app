import { useState } from 'react'
import { BookOpen, FileCheck, Plus, CheckCircle } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useDocument } from '../context/DocumentContext'
import type { DrawingRegisterItem, Submittal } from '../types'

type Tab = 'drawings' | 'submittals' | 'new'
type NewSubTab = 'drawing' | 'submittal'

const DISC_ZH: Record<DrawingRegisterItem['discipline'], string> = {
  structural: '結構', architectural: '建築', mep: 'M&E', civil: '土木'
}
const DISC_COLOR: Record<DrawingRegisterItem['discipline'], string> = {
  structural: 'bg-blue-100 text-blue-700',
  architectural: 'bg-purple-100 text-purple-700',
  mep: 'bg-orange-100 text-orange-700',
  civil: 'bg-green-100 text-green-700',
}
const DRW_STATUS_STYLE: Record<string, string> = {
  current: 'bg-green-100 text-green-700',
  superseded: 'bg-gray-100 text-gray-500',
  'under-review': 'bg-yellow-100 text-yellow-700',
}
const DRW_STATUS_ZH: Record<string, string> = {
  current: '現行版本', superseded: '已廢止', 'under-review': '審查中'
}
const SUB_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  submitted: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  resubmit: 'bg-orange-100 text-orange-700',
}
const SUB_STATUS_ZH: Record<string, string> = {
  pending: '待提交', submitted: '已提交', approved: '已批准', rejected: '已拒絕', resubmit: '需重新提交'
}

export default function DocControlApp() {
  const { user } = useAuth()
  const { currentProjectId } = useProgress()
  const { drawings, submittals, addDrawing, supersedDrawing, addSubmittal, updateSubmittalStatus } = useDocument()

  const [activeTab, setActiveTab] = useState<Tab>('drawings')
  const [newSubTab, setNewSubTab] = useState<NewSubTab>('drawing')
  const [disciplineFilter, setDisciplineFilter] = useState<DrawingRegisterItem['discipline'] | 'all'>('all')

  // Drawing form
  const [dNo, setDNo] = useState('')
  const [dTitle, setDTitle] = useState('')
  const [dDiscipline, setDDiscipline] = useState<DrawingRegisterItem['discipline']>('structural')
  const [dRevision, setDRevision] = useState('')
  const [dIssueDate, setDIssueDate] = useState('')
  const [dReceivedDate, setDReceivedDate] = useState('')
  const [drawingAdded, setDrawingAdded] = useState(false)

  // Submittal form
  const [sNo, setSNo] = useState('')
  const [sTitle, setSTitle] = useState('')
  const [sCategory, setSCategory] = useState('物料批核')
  const [sSubmittedBy, setSSubmittedBy] = useState(user?.name ?? '')
  const [submittalAdded, setSubmittalAdded] = useState(false)

  // Remarks modal
  const [remarksModalId, setRemarksModalId] = useState<string | null>(null)
  const [remarksText, setRemarksText] = useState('')
  const [remarksStatus, setRemarksStatus] = useState<Submittal['status']>('approved')

  const filteredDrawings = disciplineFilter === 'all'
    ? drawings
    : drawings.filter(d => d.discipline === disciplineFilter)

  const handleAddDrawing = () => {
    if (!dNo.trim() || !dTitle.trim() || !dIssueDate) return
    addDrawing({
      projectId: currentProjectId,
      drawingNo: dNo.trim(),
      title: dTitle.trim(),
      discipline: dDiscipline,
      revision: dRevision.trim() || 'Rev.A',
      issueDate: dIssueDate,
      receivedDate: dReceivedDate || dIssueDate,
      status: 'current',
      distributedTo: [],
    })
    setDNo(''); setDTitle(''); setDRevision(''); setDIssueDate(''); setDReceivedDate('')
    setDrawingAdded(true)
  }

  const handleAddSubmittal = () => {
    if (!sNo.trim() || !sTitle.trim()) return
    addSubmittal({
      projectId: currentProjectId,
      submittalNo: sNo.trim(),
      title: sTitle.trim(),
      category: sCategory,
      submittedBy: sSubmittedBy.trim(),
      submittedAt: new Date().toISOString().slice(0, 10),
      status: 'submitted',
    })
    setSNo(''); setSTitle('')
    setSubmittalAdded(true)
  }

  const handleUpdateStatus = () => {
    if (!remarksModalId) return
    updateSubmittalStatus(remarksModalId, remarksStatus, remarksText.trim() || undefined)
    setRemarksModalId(null)
    setRemarksText('')
  }

  const tabs = [
    { id: 'drawings' as Tab, label: '圖則登記冊', icon: BookOpen },
    { id: 'submittals' as Tab, label: 'Submittal追蹤', icon: FileCheck },
    { id: 'new' as Tab, label: '新增記錄', icon: Plus },
  ]

  return (
    <div className="min-h-screen bg-indigo-50">
      <Navbar accentColor="bg-indigo-600" bgColor="bg-indigo-800" />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-1 justify-center ${
                    isActive ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  <Icon size={15} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {/* ===== DRAWINGS TAB ===== */}
            {activeTab === 'drawings' && (
              <div>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="font-semibold text-gray-800">圖則登記冊</h2>
                  <div className="flex gap-2 flex-wrap">
                    {(['all','structural','architectural','mep','civil'] as const).map(d => (
                      <button key={d} onClick={() => setDisciplineFilter(d)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          disciplineFilter === d ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-indigo-50'
                        }`}>
                        {d === 'all' ? '全部' : DISC_ZH[d]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 text-xs">
                        <th className="py-2 text-left font-medium">圖則編號</th>
                        <th className="py-2 text-left font-medium min-w-[180px]">標題</th>
                        <th className="py-2 text-center font-medium">專業</th>
                        <th className="py-2 text-center font-medium">版本</th>
                        <th className="py-2 text-center font-medium">發出日期</th>
                        <th className="py-2 text-center font-medium">狀態</th>
                        <th className="py-2 text-center font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredDrawings.map(d => (
                        <tr key={d.id} className={`hover:bg-gray-50 ${d.status === 'superseded' ? 'opacity-50' : ''}`}>
                          <td className="py-2.5 font-mono text-xs text-gray-600">{d.drawingNo}</td>
                          <td className="py-2.5 text-gray-800">{d.title}</td>
                          <td className="py-2.5 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DISC_COLOR[d.discipline]}`}>{DISC_ZH[d.discipline]}</span>
                          </td>
                          <td className="py-2.5 text-center text-gray-600 font-mono text-xs">{d.revision}</td>
                          <td className="py-2.5 text-center text-gray-500 text-xs">{d.issueDate}</td>
                          <td className="py-2.5 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DRW_STATUS_STYLE[d.status]}`}>{DRW_STATUS_ZH[d.status]}</span>
                          </td>
                          <td className="py-2.5 text-center">
                            {d.status === 'current' && (
                              <button onClick={() => supersedDrawing(d.id)}
                                className="text-xs text-red-600 hover:text-red-800 hover:underline">廢止</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== SUBMITTALS TAB ===== */}
            {activeTab === 'submittals' && (
              <div>
                <h2 className="font-semibold text-gray-800 mb-4">Submittal 追蹤</h2>
                <div className="space-y-2">
                  {submittals.map(s => (
                    <div key={s.id} className="p-4 border border-gray-100 rounded-xl hover:border-indigo-200 transition-colors">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-gray-500">{s.submittalNo}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SUB_STATUS_STYLE[s.status]}`}>{SUB_STATUS_ZH[s.status]}</span>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.category}</span>
                          </div>
                          <p className="font-semibold text-gray-800">{s.title}</p>
                          <div className="flex gap-3 text-xs text-gray-500 mt-1">
                            <span>👤 {s.submittedBy}</span>
                            <span>📅 {s.submittedAt}</span>
                          </div>
                          {s.remarks && (
                            <p className="mt-1 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded">備注：{s.remarks}</p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => { setRemarksModalId(s.id); setRemarksText(''); setRemarksStatus('approved') }}
                            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                            更新狀態
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== NEW RECORD TAB ===== */}
            {activeTab === 'new' && (
              <div>
                <h2 className="font-semibold text-gray-800 mb-4">新增記錄</h2>
                <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-5 max-w-xs">
                  <button onClick={() => setNewSubTab('drawing')}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${newSubTab === 'drawing' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                    圖則
                  </button>
                  <button onClick={() => setNewSubTab('submittal')}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${newSubTab === 'submittal' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                    Submittal
                  </button>
                </div>

                {newSubTab === 'drawing' && (
                  <div className="max-w-lg space-y-3">
                    {drawingAdded && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2 mb-2">
                        <CheckCircle size={16} /> 圖則已成功新增。
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">圖則編號 *</label>
                        <input value={dNo} onChange={e => setDNo(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                          placeholder="例：STR-A-002" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">版本</label>
                        <input value={dRevision} onChange={e => setDRevision(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                          placeholder="Rev.A" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">標題 *</label>
                      <input value={dTitle} onChange={e => setDTitle(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                        placeholder="圖則標題" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">專業</label>
                      <select value={dDiscipline} onChange={e => setDDiscipline(e.target.value as DrawingRegisterItem['discipline'])}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                        <option value="structural">結構 (Structural)</option>
                        <option value="architectural">建築 (Architectural)</option>
                        <option value="mep">M&E</option>
                        <option value="civil">土木 (Civil)</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">發出日期 *</label>
                        <input type="date" value={dIssueDate} onChange={e => setDIssueDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">收到日期</label>
                        <input type="date" value={dReceivedDate} onChange={e => setDReceivedDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                      </div>
                    </div>
                    <button onClick={handleAddDrawing} disabled={!dNo.trim() || !dTitle.trim() || !dIssueDate}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                      新增圖則
                    </button>
                  </div>
                )}

                {newSubTab === 'submittal' && (
                  <div className="max-w-lg space-y-3">
                    {submittalAdded && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2 mb-2">
                        <CheckCircle size={16} /> Submittal 已成功新增。
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">Submittal 編號 *</label>
                        <input value={sNo} onChange={e => setSNo(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                          placeholder="例：SUB-004" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">類別</label>
                        <select value={sCategory} onChange={e => setSCategory(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                          {['物料批核','方法陳述','樣板','計算書','工程計劃','其他'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">標題 *</label>
                      <input value={sTitle} onChange={e => setSTitle(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                        placeholder="Submittal 標題" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">提交人</label>
                      <input value={sSubmittedBy} onChange={e => setSSubmittedBy(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                    <button onClick={handleAddSubmittal} disabled={!sNo.trim() || !sTitle.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                      新增 Submittal
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Update status modal */}
      {remarksModalId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4">更新 Submittal 狀態</h3>
            <div className="mb-3">
              <label className="text-sm font-medium text-gray-700 mb-1 block">新狀態</label>
              <select value={remarksStatus} onChange={e => setRemarksStatus(e.target.value as Submittal['status'])}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                <option value="submitted">已提交</option>
                <option value="approved">已批准</option>
                <option value="rejected">已拒絕</option>
                <option value="resubmit">需重新提交</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1 block">備注 (選填)</label>
              <textarea rows={3} value={remarksText} onChange={e => setRemarksText(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                placeholder="審閱備注..." />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRemarksModalId(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button onClick={handleUpdateStatus}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
