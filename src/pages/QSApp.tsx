import { useState } from 'react'
import { DollarSign, FileText, BarChart2, Plus, CheckCircle } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useCost } from '../context/CostContext'
import type { VariationOrder } from '../types'

type Tab = 'boq' | 'vo' | 'overview'

const VO_STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}
const VO_STATUS_ZH: Record<string, string> = {
  draft: '草稿', submitted: '已提交', approved: '已批准', rejected: '已拒絕'
}

const TYPE_ZH: Record<string, string> = { addition: '追加', omission: '刪減', substitution: '替換' }

function fmt(n: number) {
  return new Intl.NumberFormat('zh-HK', { style: 'currency', currency: 'HKD', maximumFractionDigits: 0 }).format(n)
}

export default function QSApp() {
  const { user } = useAuth()
  const { currentProjectId } = useProgress()
  const { boqItems, variationOrders, addVO, submitVO, approveVO, rejectVO, totalContractSum, totalCompletedAmount, totalVOAmount } = useCost()

  const [activeTab, setActiveTab] = useState<Tab>('boq')

  // VO form
  const [showVOForm, setShowVOForm] = useState(false)
  const [voDescription, setVoDescription] = useState('')
  const [voAmount, setVoAmount] = useState('')
  const [voType, setVoType] = useState<VariationOrder['type']>('addition')
  const [voSubmitted, setVoSubmitted] = useState(false)

  const completionPct = totalContractSum > 0 ? (totalCompletedAmount / totalContractSum) * 100 : 0

  const handleAddVO = () => {
    if (!voDescription.trim() || !voAmount || !user) return
    addVO({
      projectId: currentProjectId,
      voNo: '',
      description: voDescription.trim(),
      raisedBy: user.id,
      raisedByName: user.name,
      amount: Number(voAmount),
      type: voType,
    })
    setVoDescription('')
    setVoAmount('')
    setVoType('addition')
    setShowVOForm(false)
    setVoSubmitted(true)
  }

  // Chart data
  const chartData = boqItems.map(b => ({
    name: b.code,
    合約金額: Math.round(b.contractAmount / 1000000),
    完成金額: Math.round(b.completedAmount / 1000000),
  }))

  const tabs = [
    { id: 'boq' as Tab, label: 'BOQ總表', icon: FileText },
    { id: 'vo' as Tab, label: '差異令(VO)', icon: Plus },
    { id: 'overview' as Tab, label: '成本概覽', icon: BarChart2 },
  ]

  return (
    <div className="min-h-screen bg-teal-50">
      <Navbar accentColor="bg-teal-600" bgColor="bg-teal-800" />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Identity card */}
        <div className="bg-white rounded-xl border border-teal-100 shadow-sm p-4 mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {user?.avatar}
          </div>
          <div>
            <p className="font-bold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.roleZh} · {user?.company}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">合約總額</p>
            <p className="font-bold text-teal-700 text-lg">{fmt(totalContractSum)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="grid grid-flow-col auto-cols-fr border-b border-gray-100">
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors flex-1 justify-center ${
                    isActive ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  <Icon size={15} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {/* ===== BOQ TAB ===== */}
            {activeTab === 'boq' && (
              <div>
                <h2 className="font-semibold text-gray-800 mb-4">合約工程量清單 (BOQ)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 text-xs">
                        <th className="py-2 text-left font-medium">編號</th>
                        <th className="py-2 text-left font-medium min-w-[200px]">描述</th>
                        <th className="py-2 text-center font-medium">單位</th>
                        <th className="py-2 text-right font-medium">合約量</th>
                        <th className="py-2 text-right font-medium">完成量</th>
                        <th className="py-2 text-right font-medium">完成%</th>
                        <th className="py-2 text-right font-medium">合約金額</th>
                        <th className="py-2 text-right font-medium">完成金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {boqItems.map(item => {
                        const pct = item.contractQty > 0 ? (item.completedQty / item.contractQty) * 100 : 0
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="py-2.5 text-gray-500 font-mono text-xs">{item.code}</td>
                            <td className="py-2.5 text-gray-800">{item.description}</td>
                            <td className="py-2.5 text-center text-gray-500">{item.unit}</td>
                            <td className="py-2.5 text-right text-gray-600">{item.contractQty.toLocaleString()}</td>
                            <td className="py-2.5 text-right text-gray-600">{item.completedQty.toLocaleString()}</td>
                            <td className="py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-teal-500' : 'bg-yellow-500'}`}
                                    style={{ width: `${Math.min(100, pct)}%` }} />
                                </div>
                                <span className={`text-xs font-medium ${pct >= 100 ? 'text-green-700' : pct >= 50 ? 'text-teal-700' : 'text-yellow-700'}`}>
                                  {Math.round(pct)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 text-right text-gray-700">{fmt(item.contractAmount)}</td>
                            <td className="py-2.5 text-right font-medium text-teal-700">{fmt(item.completedAmount)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-teal-200 bg-teal-50 font-bold">
                        <td colSpan={6} className="py-3 text-teal-800 text-sm">合計</td>
                        <td className="py-3 text-right text-teal-800">{fmt(totalContractSum)}</td>
                        <td className="py-3 text-right text-teal-700">{fmt(totalCompletedAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ===== VO TAB ===== */}
            {activeTab === 'vo' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">差異令 (Variation Orders)</h2>
                  <button onClick={() => { setShowVOForm(!showVOForm); setVoSubmitted(false) }}
                    className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                    <Plus size={14} /> 新增VO
                  </button>
                </div>

                {voSubmitted && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle size={16} /> VO 已成功新增。
                  </div>
                )}

                {showVOForm && (
                  <div className="mb-5 p-4 bg-teal-50 border border-teal-200 rounded-xl space-y-3">
                    <h3 className="font-semibold text-teal-800 text-sm">新增差異令</h3>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">描述 *</label>
                      <textarea value={voDescription} onChange={e => setVoDescription(e.target.value)} rows={2}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none"
                        placeholder="VO 工程描述..." />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">金額 (HKD) *</label>
                        <input type="number" value={voAmount} onChange={e => setVoAmount(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                          placeholder="0" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">類型</label>
                        <select value={voType} onChange={e => setVoType(e.target.value as VariationOrder['type'])}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
                          <option value="addition">追加</option>
                          <option value="omission">刪減</option>
                          <option value="substitution">替換</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleAddVO} disabled={!voDescription.trim() || !voAmount}
                        className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        提交
                      </button>
                      <button onClick={() => setShowVOForm(false)}
                        className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {variationOrders.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-sm">暫無差異令</div>
                ) : (
                  <div className="space-y-3">
                    {variationOrders.map(vo => (
                      <div key={vo.id} className="p-4 border border-gray-100 rounded-xl">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-mono text-xs text-gray-500">{vo.voNo}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VO_STATUS_STYLE[vo.status]}`}>{VO_STATUS_ZH[vo.status]}</span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{TYPE_ZH[vo.type]}</span>
                            </div>
                            <p className="font-semibold text-gray-800">{vo.description}</p>
                            <div className="flex gap-3 text-xs text-gray-500 mt-1">
                              <span>💰 {fmt(vo.amount)}</span>
                              <span>👤 {vo.raisedByName}</span>
                              <span>📅 {vo.raisedAt.slice(0, 10)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            {vo.status === 'draft' && (
                              <button onClick={() => submitVO(vo.id)}
                                className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                                提交審批
                              </button>
                            )}
                            {vo.status === 'submitted' && user && (
                              <>
                                <button onClick={() => approveVO(vo.id, user.name)}
                                  className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                  批准
                                </button>
                                <button onClick={() => rejectVO(vo.id)}
                                  className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                  拒絕
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== OVERVIEW TAB ===== */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <h2 className="font-semibold text-gray-800">成本概覽</h2>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">合約總額</p>
                    <p className="text-xl font-bold text-teal-700">{fmt(totalContractSum)}</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">已完成金額</p>
                    <p className="text-xl font-bold text-blue-700">{fmt(totalCompletedAmount)}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">完成%</p>
                    <p className="text-xl font-bold text-green-700">{completionPct.toFixed(1)}%</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">已批VO金額</p>
                    <p className="text-xl font-bold text-purple-700">{fmt(totalVOAmount)}</p>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">整體完成進度</span>
                    <span className="text-sm font-bold text-teal-700">{completionPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${completionPct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>HK$0</span>
                    <span>{fmt(totalContractSum)}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">各項目合約金額 vs 完成金額 (百萬HKD)</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} unit="M" />
                      <Tooltip formatter={(v: number) => `HK$${v}M`} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="合約金額" fill="#0d9488" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="完成金額" fill="#5eead4" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center gap-4 p-4 bg-teal-50 border border-teal-200 rounded-xl text-sm">
                  <DollarSign size={20} className="text-teal-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-teal-800">剩餘合約價值</p>
                    <p className="text-teal-600">{fmt(totalContractSum - totalCompletedAmount)}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-gray-500">已批VO調整後合約總額</p>
                    <p className="font-bold text-teal-700">{fmt(totalContractSum + totalVOAmount)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
