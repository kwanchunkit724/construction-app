import { useEffect, useState } from 'react'
import { Plus, Building2, UserCog, Trash2, RefreshCw, Download, GitBranch, Shield, ToggleLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { CreateProjectModal } from '../components/CreateProjectModal'
import { AssignPMModal } from '../components/AssignPMModal'
import { useProjects } from '../contexts/ProjectsContext'
import { usePtwFlag } from '../contexts/PtwFlagContext'
import { supabase } from '../lib/supabase'
import type { Project, UserProfile } from '../types'

export default function AdminProjects() {
  const { loading, projects, fetchError, refetch, deleteProject } = useProjects()
  const { enabled: ptwEnabled, loading: ptwLoading, setEnabled: setPtwEnabled } = usePtwFlag()
  const [createOpen, setCreateOpen] = useState(false)
  const [assigning, setAssigning] = useState<Project | null>(null)
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [ptwSaving, setPtwSaving] = useState(false)
  const [ptwError, setPtwError] = useState<string | null>(null)

  // Force a fresh fetch every time admin opens this page
  useEffect(() => { refetch() }, [refetch])

  async function manualRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  async function handleExport() {
    const ids = Array.from(new Set(projects.flatMap(p => p.assigned_pm_ids)))
    const users: Record<string, UserProfile> = {}
    if (ids.length > 0) {
      // v17: admin RPC bypasses narrowed user_profiles SELECT policy.
      const { data } = await supabase.rpc('admin_list_user_profiles')
      if (data) {
        const idSet = new Set(ids)
        for (const u of data as UserProfile[]) {
          if (idSet.has(u.id)) users[u.id] = u
        }
      }
    }
    const { exportProjectsToExcel } = await import('../lib/export')
    await exportProjectsToExcel(projects, users)
  }

  async function togglePtw() {
    setPtwError(null)
    setPtwSaving(true)
    const { error } = await setPtwEnabled(!ptwEnabled)
    if (error) setPtwError(error)
    setPtwSaving(false)
  }

  return (
    <AppLayout title="管理">
      <div className="card p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center flex-shrink-0">
            <Shield size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-site-900">工作許可證 (PTW) 功能</p>
            <p className="text-xs text-site-500 mt-0.5">
              關閉時：除管理員外所有用戶介面隱藏 PTW 入口
            </p>
            {ptwError && (
              <p className="text-xs text-red-600 mt-1">⚠ {ptwError}</p>
            )}
          </div>
          <button
            onClick={togglePtw}
            disabled={ptwSaving || ptwLoading}
            className={`flex-shrink-0 px-4 h-10 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              ptwEnabled
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-site-100 text-site-600 hover:bg-site-200'
            }`}
            aria-label="切換 PTW 功能"
          >
            {ptwLoading ? '...' : ptwEnabled ? '已啟用' : '已關閉'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setCreateOpen(true)}
          className="btn-primary flex-1"
        >
          <Plus size={20} /> 新增工地項目
        </button>
        <button
          onClick={handleExport}
          className="btn-ghost flex-shrink-0 px-4"
          aria-label="匯出 Excel"
          title="匯出 Excel"
        >
          <Download size={18} />
        </button>
        <button
          onClick={manualRefresh}
          disabled={refreshing}
          className="btn-ghost flex-shrink-0 px-4"
          aria-label="刷新"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {fetchError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
          ⚠ 讀取失敗：{fetchError}
        </div>
      )}

      <div className="text-xs text-site-400 mb-2">
        當前可見項目：{projects.length}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner size={28} /></div>
      ) : projects.length === 0 ? (
        <div className="card p-10 text-center">
          <Building2 size={40} className="mx-auto text-site-300 mb-3" />
          <p className="text-sm text-site-500">還未有任何項目</p>
          <p className="text-xs text-site-400 mt-1">點擊上方按鈕新增第一個工地</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map(p => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-safety-100 text-safety-600 flex items-center justify-center flex-shrink-0">
                  <Building2 size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-site-900 truncate">{p.name}</p>
                  <p className="text-xs text-site-500 mt-0.5">
                    {p.zones.length} 個分區 · {p.assigned_pm_ids.length} 位 PM
                  </p>
                  {p.zones.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.zones.slice(0, 4).map(z => (
                        <span key={z.id} className="text-[10px] bg-site-100 text-site-600 px-2 py-0.5 rounded-full font-mono">
                          {z.id}
                        </span>
                      ))}
                      {p.zones.length > 4 && (
                        <span className="text-[10px] text-site-400">+{p.zones.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mt-3 pt-3 border-t border-site-100">
                <button
                  onClick={() => setAssigning(p)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-site-700 bg-site-100 hover:bg-site-200 py-2 rounded-lg"
                >
                  <UserCog size={16} /> 指派 PM
                </button>
                <Link
                  to={`/admin/projects/${p.id}/chains`}
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 py-2 rounded-lg"
                  title="設定簽核流程"
                >
                  <GitBranch size={16} /> 簽核流程
                </Link>
                <Link
                  to={`/admin/projects/${p.id}/modules`}
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 py-2 rounded-lg"
                  title="設定模組"
                >
                  <ToggleLeft size={16} /> 模組
                </Link>
                {confirmDelId === p.id ? (
                  <>
                    <button
                      onClick={async () => { await deleteProject(p.id); setConfirmDelId(null) }}
                      className="text-sm font-semibold bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg"
                    >
                      確認刪除
                    </button>
                    <button
                      onClick={() => setConfirmDelId(null)}
                      className="text-sm border border-site-200 text-site-500 px-3 py-2 rounded-lg hover:bg-site-50"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDelId(p.id)}
                    className="flex items-center justify-center text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-2 rounded-lg"
                    aria-label="刪除"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <AssignPMModal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        project={assigning}
      />
    </AppLayout>
  )
}
