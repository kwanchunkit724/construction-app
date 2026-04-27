import { useState } from 'react'
import { Package, BarChart2, Users, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { useProcurement } from '../context/ProcurementContext'

type Tab = 'requests' | 'inventory' | 'suppliers'

const REQ_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  ordered: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}
const REQ_STATUS_ZH: Record<string, string> = {
  pending: '待審批', approved: '已批准', ordered: '已訂購', delivered: '已到貨', rejected: '已拒絕'
}

const INVENTORY = [
  { name: '鋼筋 32mm', unit: '噸', onHand: 12, minStock: 20, status: 'low' as const },
  { name: '鋼筋 25mm', unit: '噸', onHand: 8, minStock: 15, status: 'critical' as const },
  { name: '鋼筋 16mm', unit: '噸', onHand: 25, minStock: 10, status: 'sufficient' as const },
  { name: '混凝土 C35', unit: 'm³', onHand: 150, minStock: 50, status: 'sufficient' as const },
  { name: '模板', unit: 'm²', onHand: 200, minStock: 300, status: 'critical' as const },
  { name: '鐵線', unit: '卷', onHand: 45, minStock: 30, status: 'sufficient' as const },
]

const INV_STATUS: Record<string, { style: string; zh: string }> = {
  sufficient: { style: 'bg-green-100 text-green-700', zh: '充足' },
  low: { style: 'bg-orange-100 text-orange-700', zh: '偏低' },
  critical: { style: 'bg-red-100 text-red-700', zh: '告急' },
}

const SUPPLIERS = [
  { name: '明達建材有限公司', category: '鋼筋 / 金屬', contact: '2345 6789', leadTime: '5-7 工作日' },
  { name: '大成混凝土集團', category: '預拌混凝土', contact: '3456 7890', leadTime: '1-2 工作日' },
  { name: '港豐模板工程', category: '模板 / 支撐', contact: '4567 8901', leadTime: '3-5 工作日' },
  { name: '興記五金工具', category: '工具 / 消耗品', contact: '5678 9012', leadTime: '即日到貨' },
  { name: '環球安全設備', category: 'PPE / 安全設施', contact: '6789 0123', leadTime: '2-3 工作日' },
]

export default function ProcurementApp() {
  const { user } = useAuth()
  const { requests, approveRequest, markOrdered, markDelivered, rejectRequest } = useProcurement()

  const [activeTab, setActiveTab] = useState<Tab>('requests')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Approve modal
  const [approveModalId, setApproveModalId] = useState<string | null>(null)
  const [expectedDelivery, setExpectedDelivery] = useState('')

  const lowStockCount = INVENTORY.filter(i => i.status !== 'sufficient').length

  const handleApprove = () => {
    if (!approveModalId || !expectedDelivery || !user) return
    approveRequest(approveModalId, user.name, expectedDelivery)
    setApproveModalId(null)
    setExpectedDelivery('')
  }

  const tabs = [
    { id: 'requests' as Tab, label: '物料申請', icon: Package, badge: requests.filter(r => r.status === 'pending').length },
    { id: 'inventory' as Tab, label: '庫存狀況', icon: BarChart2, badge: lowStockCount },
    { id: 'suppliers' as Tab, label: '供應商', icon: Users },
  ]

  return (
    <div className="min-h-screen bg-amber-50">
      <Navbar accentColor="bg-amber-600" bgColor="bg-amber-800" />

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
                    isActive ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  <Icon size={15} />
                  {tab.label}
                  {'badge' in tab && (tab as { badge: number }).badge > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                      {(tab as { badge: number }).badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {/* ===== REQUESTS ===== */}
            {activeTab === 'requests' && (
              <div>
                <h2 className="font-semibold text-gray-800 mb-4">物料申請管理</h2>
                {requests.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Package size={40} className="mx-auto mb-3 opacity-30" />
                    <p>暫無物料申請</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map(req => (
                      <div key={req.id} className="border border-gray-100 rounded-xl overflow-hidden">
                        <div
                          className="p-4 cursor-pointer hover:bg-gray-50 flex items-start justify-between gap-2"
                          onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-mono text-xs text-gray-500">{req.requestNo}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REQ_STATUS_STYLE[req.status]}`}>
                                {REQ_STATUS_ZH[req.status]}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                              <span>👤 {req.requestedByName}</span>
                              <span>📍 {req.zone}</span>
                              <span>📅 {req.requestedAt.slice(0, 10)}</span>
                              <span>📦 {req.items.length} 項物料</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {req.status === 'pending' && (
                              <>
                                <button onClick={e => { e.stopPropagation(); setApproveModalId(req.id); setExpectedDelivery('') }}
                                  className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                  批准
                                </button>
                                <button onClick={e => { e.stopPropagation(); rejectRequest(req.id) }}
                                  className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                  拒絕
                                </button>
                              </>
                            )}
                            {req.status === 'approved' && (
                              <button onClick={e => { e.stopPropagation(); markOrdered(req.id) }}
                                className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                已訂購
                              </button>
                            )}
                            {req.status === 'ordered' && (
                              <button onClick={e => { e.stopPropagation(); markDelivered(req.id) }}
                                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                已到貨
                              </button>
                            )}
                            {req.status === 'delivered' && (
                              <CheckCircle size={18} className="text-green-500" />
                            )}
                            {expandedId === req.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                          </div>
                        </div>
                        {expandedId === req.id && (
                          <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
                            <p className="text-xs font-medium text-gray-500 mb-2 mt-3">物料清單</p>
                            <div className="space-y-1">
                              {req.items.map((item, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                                  <span className="flex-1">{item.material}</span>
                                  <span className="text-gray-500">{item.quantity} {item.unit}</span>
                                  {item.urgency === 'urgent' && (
                                    <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-medium">緊急</span>
                                  )}
                                </div>
                              ))}
                            </div>
                            {req.notes && <p className="mt-2 text-xs text-gray-400">備注：{req.notes}</p>}
                            {req.expectedDelivery && <p className="mt-1 text-xs text-blue-600">預計到貨：{req.expectedDelivery}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== INVENTORY ===== */}
            {activeTab === 'inventory' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">庫存狀況</h2>
                  {lowStockCount > 0 && (
                    <span className="bg-red-100 text-red-700 text-xs px-3 py-1 rounded-full font-medium">
                      ⚠ {lowStockCount} 項低存量警示
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 text-xs">
                        <th className="py-2 text-left font-medium">物料</th>
                        <th className="py-2 text-center font-medium">單位</th>
                        <th className="py-2 text-right font-medium">現有量</th>
                        <th className="py-2 text-right font-medium">最低存量</th>
                        <th className="py-2 text-center font-medium">狀態</th>
                        <th className="py-2 text-left font-medium">存量條</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {INVENTORY.map(item => (
                        <tr key={item.name} className="hover:bg-gray-50">
                          <td className="py-3 font-medium text-gray-800">{item.name}</td>
                          <td className="py-3 text-center text-gray-500">{item.unit}</td>
                          <td className="py-3 text-right font-bold text-gray-800">{item.onHand}</td>
                          <td className="py-3 text-right text-gray-500">{item.minStock}</td>
                          <td className="py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INV_STATUS[item.status].style}`}>
                              {INV_STATUS[item.status].zh}
                            </span>
                          </td>
                          <td className="py-3 w-32">
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  item.status === 'critical' ? 'bg-red-500' :
                                  item.status === 'low' ? 'bg-orange-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(100, (item.onHand / item.minStock) * 100)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== SUPPLIERS ===== */}
            {activeTab === 'suppliers' && (
              <div>
                <h2 className="font-semibold text-gray-800 mb-4">認可供應商名單</h2>
                <div className="space-y-3">
                  {SUPPLIERS.map(s => (
                    <div key={s.name} className="p-4 border border-gray-100 rounded-xl hover:border-amber-200 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-800">{s.name}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{s.category}</span>
                            <span>📞 {s.contact}</span>
                            <span>🚚 交期：{s.leadTime}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Approve modal */}
      {approveModalId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4">批准物料申請</h3>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1 block">預計到貨日期 *</label>
              <input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setApproveModalId(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button onClick={handleApprove} disabled={!expectedDelivery}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
                確認批准
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
