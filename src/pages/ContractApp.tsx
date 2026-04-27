import { useState, useEffect } from 'react'
import { FileText, Plus, Trash2, ChevronDown, ChevronRight, Building2, DollarSign, CheckCircle2 } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useContracts } from '../context/ContractContext'
import { supabase } from '../lib/supabase'
import type { SubContract } from '../types'

const TRADES = ['釘板工程', '紮鐵工程', '泥水工程', '鋁窗工程', '機電工程', '管道工程', '油漆工程', '石屎工程', '地盤雜工', '其他']

interface SubProfile { id: string; name: string; company: string }

function fmt(n: number) {
  return new Intl.NumberFormat('zh-HK', { style: 'currency', currency: 'HKD', maximumFractionDigits: 0 }).format(n)
}

export default function ContractApp() {
  const { user } = useAuth()
  const { currentProjectId, currentProject } = useProgress()
  const { contracts, addContract, deleteContract, addItem, removeItem } = useContracts()

  const [subSups, setSubSups] = useState<SubProfile[]>([])
  useEffect(() => {
    supabase.from('profiles').select('id,name,company').eq('role', 'sub-supervisor')
      .then(({ data }) => { if (data) setSubSups(data as SubProfile[]) })
  }, [])

  const projectContracts = contracts.filter(c => c.projectId === currentProjectId)

  // Expanded contract cards
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // New contract form
  const [showForm, setShowForm] = useState(false)
  const [fSubId, setFSubId]       = useState('')
  const [fContractNo, setFContractNo] = useState('')
  const [fTrade, setFTrade]       = useState(TRADES[0])
  const [fDate, setFDate]         = useState(new Date().toISOString().slice(0, 10))
  const [fValue, setFValue]       = useState('')
  const [fFileRef, setFFileRef]   = useState('')

  const handleAddContract = () => {
    const sup = subSups.find(s => s.id === fSubId)
    if (!sup || !fContractNo.trim()) return
    addContract({
      projectId: currentProjectId,
      contractNo: fContractNo.trim(),
      subContractorId: sup.id,
      subContractorName: sup.name,
      company: sup.company,
      trade: fTrade,
      signedDate: fDate,
      value: Number(fValue) || 0,
      items: [],
      fileRef: fFileRef.trim() || undefined,
      createdBy: user?.name ?? '',
    })
    setShowForm(false)
    setFSubId(''); setFContractNo(''); setFValue(''); setFFileRef('')
  }

  // Add item form per contract
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null)
  const [iClause, setIClause]   = useState('')
  const [iTrade, setITrade]     = useState(TRADES[0])
  const [iDesc, setIDesc]       = useState('')
  const [iCleanup, setICleanup] = useState(false)
  const [iNotes, setINotes]     = useState('')

  const handleAddItem = (contractId: string) => {
    if (!iDesc.trim()) return
    addItem(contractId, {
      clauseNo: iClause.trim(),
      trade: iTrade,
      description: iDesc.trim(),
      includesCleanup: iCleanup,
      notes: iNotes.trim() || undefined,
    })
    setAddingItemFor(null)
    setIClause(''); setIDesc(''); setICleanup(false); setINotes('')
  }

  const totalValue = projectContracts.reduce((s, c) => s + c.value, 0)

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar accentColor="bg-slate-600" bgColor="bg-slate-900" />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileText size={20} className="text-slate-600" /> 判頭合約管理
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{currentProject?.name ?? '未選擇項目'}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-400">合約總值</p>
              <p className="font-bold text-slate-700">{fmt(totalValue)}</p>
            </div>
            {(user?.role === 'pm' || user?.role === 'pe') && (
              <button onClick={() => setShowForm(v => !v)}
                className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
                <Plus size={15} /> 新增合約
              </button>
            )}
          </div>
        </div>

        {/* New contract form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">新增判頭合約</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">判頭 *</label>
                <select value={fSubId} onChange={e => setFSubId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400">
                  <option value="">選擇判頭...</option>
                  {subSups.map(s => <option key={s.id} value={s.id}>{s.name}（{s.company}）</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">合約編號 *</label>
                <input value={fContractNo} onChange={e => setFContractNo(e.target.value)}
                  placeholder="e.g. SC-2024-001"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">工程類別</label>
                <select value={fTrade} onChange={e => setFTrade(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400">
                  {TRADES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">簽約日期</label>
                <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">合約金額（HKD）</label>
                <input type="number" value={fValue} onChange={e => setFValue(e.target.value)}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">合約文件參考</label>
                <input value={fFileRef} onChange={e => setFFileRef(e.target.value)}
                  placeholder="e.g. SC-001.pdf / 第3章"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleAddContract} disabled={!fSubId || !fContractNo.trim()}
                className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors">
                建立合約
              </button>
              <button onClick={() => setShowForm(false)}
                className="border border-slate-200 text-slate-600 px-5 py-2 rounded-xl text-sm hover:bg-slate-50 transition-colors">
                取消
              </button>
            </div>
          </div>
        )}

        {/* Contract list */}
        {projectContracts.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">尚未建立任何判頭合約</p>
          </div>
        ) : (
          <div className="space-y-4">
            {projectContracts.map(c => {
              const isOpen = expanded.has(c.id)
              return (
                <div key={c.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  {/* Contract header */}
                  <button onClick={() => toggle(c.id)}
                    className="w-full flex items-start gap-3 p-4 hover:bg-slate-50 transition-colors text-left">
                    {isOpen ? <ChevronDown size={16} className="text-slate-400 mt-1 flex-shrink-0" />
                             : <ChevronRight size={16} className="text-slate-400 mt-1 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-slate-400">{c.contractNo}</span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{c.trade}</span>
                        {c.items.length > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            {c.items.length} 項條款
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900 flex items-center gap-2">
                        <Building2 size={14} className="text-slate-400" />
                        {c.subContractorName}
                        <span className="text-sm text-slate-400 font-normal">({c.company})</span>
                      </p>
                      <div className="flex flex-wrap gap-4 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <DollarSign size={11} />{fmt(c.value)}
                        </span>
                        <span>簽約：{c.signedDate}</span>
                        {c.fileRef && <span>文件：{c.fileRef}</span>}
                      </div>
                    </div>
                    {(user?.role === 'pm' || user?.role === 'pe') && (
                      <button onClick={e => { e.stopPropagation(); deleteContract(c.id) }}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </button>

                  {/* Expanded: contract items */}
                  {isOpen && (
                    <div className="border-t border-slate-100 p-4 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-700">合約責任條款</h3>
                        {(user?.role === 'pm' || user?.role === 'pe') && (
                          <button onClick={() => setAddingItemFor(addingItemFor === c.id ? null : c.id)}
                            className="flex items-center gap-1 text-xs text-slate-600 border border-slate-300 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors">
                            <Plus size={11} /> 新增條款
                          </button>
                        )}
                      </div>

                      {/* Add item form */}
                      {addingItemFor === c.id && (
                        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-slate-600 mb-1 block">條款編號</label>
                              <input value={iClause} onChange={e => setIClause(e.target.value)}
                                placeholder="e.g. 3.2.1"
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-slate-400" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-slate-600 mb-1 block">工種</label>
                              <select value={iTrade} onChange={e => setITrade(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-slate-400">
                                {TRADES.map(t => <option key={t}>{t}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-600 mb-1 block">責任描述 *</label>
                            <textarea rows={2} value={iDesc} onChange={e => setIDesc(e.target.value)}
                              placeholder="例：負責清理施工垃圾及廢料，包括混凝土碎塊、釘板廢木..."
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-slate-400 resize-none" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-600 mb-1 block">備注</label>
                            <input value={iNotes} onChange={e => setINotes(e.target.value)}
                              placeholder="額外說明（選填）"
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-slate-400" />
                          </div>
                          <div className="flex items-center gap-2">
                            <input type="checkbox" id={`cleanup-${c.id}`} checked={iCleanup}
                              onChange={e => setICleanup(e.target.checked)}
                              className="rounded" />
                            <label htmlFor={`cleanup-${c.id}`} className="text-xs text-slate-600">包含執垃圾/清場責任</label>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleAddItem(c.id)} disabled={!iDesc.trim()}
                              className="flex-1 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 text-white py-1.5 rounded-lg text-xs font-semibold transition-colors">
                              新增條款
                            </button>
                            <button onClick={() => setAddingItemFor(null)}
                              className="flex-1 border border-slate-200 text-slate-500 py-1.5 rounded-lg text-xs hover:bg-slate-50 transition-colors">
                              取消
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Item list */}
                      {c.items.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">尚未添加條款，按「新增條款」開始</p>
                      ) : (
                        <div className="space-y-2">
                          {c.items.map(item => (
                            <div key={item.id} className="flex items-start gap-3 bg-white border border-slate-100 rounded-xl p-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  {item.clauseNo && (
                                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                      第 {item.clauseNo} 條
                                    </span>
                                  )}
                                  <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{item.trade}</span>
                                  {item.includesCleanup && (
                                    <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                      <CheckCircle2 size={8} /> 包含執垃圾
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-700">{item.description}</p>
                                {item.notes && <p className="text-[10px] text-slate-400 mt-0.5">備注：{item.notes}</p>}
                              </div>
                              {(user?.role === 'pm' || user?.role === 'pe') && (
                                <button onClick={() => removeItem(c.id, item.id)}
                                  className="p-1 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
