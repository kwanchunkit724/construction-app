import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, AlertCircle, Lock } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { supabase } from '../lib/supabase'
import { MODULES, MODULE_LABELS_ZH } from '../lib/modules'
import type { ModuleKey } from '../lib/modules'

export default function AdminProjectModules() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return <AdminProjectModulesInner projectId={id} />
}

function AdminProjectModulesInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const [projectName, setProjectName] = useState('')
  const [enabledByKey, setEnabledByKey] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<ModuleKey | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  async function loadModules() {
    const { data, error } = await supabase.rpc('get_project_modules', { p_project_id: projectId })
    if (error) {
      console.error('modules fetch error:', error)
      setFetchError(error.message)
      return
    }
    const map: Record<string, boolean> = {}
    ;(data as { module_key: string; enabled: boolean }[] || []).forEach(r => {
      map[r.module_key] = r.enabled
    })
    setEnabledByKey(map)
    setFetchError(null)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data: proj } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single()
      if (!cancelled) setProjectName((proj?.name as string) || '')
      await loadModules()
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  async function toggle(key: ModuleKey, next: boolean) {
    setSavingKey(key)
    setToast(null)
    const { error } = await supabase.rpc('set_project_module', {
      p_project_id: projectId,
      p_module_key: key,
      p_enabled: next,
    })
    // 助理 has a SECOND backend gate (projects.ai_enabled, checked by the Edge
    // Function in ai_enabled_for_project). Keep it in lockstep with the module
    // switch so this one toggle fully controls AI for the project — tab + backend.
    let aiErr = null
    if (!error && key === 'assistant') {
      const r = await supabase.rpc('set_project_ai_enabled', {
        p_project_id: projectId,
        p_enabled: next,
      })
      aiErr = r.error
    }
    if (error || aiErr) {
      setToast({ kind: 'err', msg: `儲存失敗：${(error || aiErr)!.message}` })
    } else {
      setToast({ kind: 'ok', msg: `已${next ? '啟用' : '關閉'}「${MODULE_LABELS_ZH[key]}」` })
      await loadModules()
    }
    setSavingKey(null)
  }

  return (
    <AppLayout title="模組設定" wide>
      <button
        onClick={() => navigate('/admin')}
        className="text-sm text-site-500 hover:text-site-900 inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft size={14} /> 返回管理
      </button>

      <div className="mb-4">
        <h2 className="text-lg font-bold text-site-900">
          模組設定{projectName ? ` — ${projectName}` : ''}
        </h2>
        <p className="text-xs text-site-500 mt-0.5">
          關閉某個模組後，除管理員外所有用戶介面隱藏該模組入口。進度為核心模組，不能關閉。
        </p>
      </div>

      {fetchError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
          ⚠ 讀取失敗：{fetchError}
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner size={28} /></div>
      ) : (
        <div className="space-y-2">
          {MODULES.map(m => {
            const enabled = enabledByKey[m.key] ?? true
            const isSaving = savingKey === m.key
            return (
              <div key={m.key} className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-site-900 flex items-center gap-1.5">
                      {m.labelZh}
                      {m.core && <Lock size={13} className="text-site-400" />}
                    </p>
                    <p className="text-[11px] text-site-400 mt-0.5 font-mono">{m.key}</p>
                  </div>
                  {m.core ? (
                    <span className="flex-shrink-0 px-4 h-10 inline-flex items-center rounded-xl text-sm font-semibold bg-site-100 text-site-500">
                      核心
                    </span>
                  ) : (
                    <button
                      onClick={() => toggle(m.key, !enabled)}
                      disabled={isSaving}
                      className={`flex-shrink-0 px-4 h-10 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                        enabled
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-site-100 text-site-600 hover:bg-site-200'
                      }`}
                      aria-label={`切換${m.labelZh}模組`}
                    >
                      {isSaving ? '...' : enabled ? '已啟用' : '已關閉'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {toast && (
        <div className={`mt-4 rounded-xl px-3 py-2 text-sm flex items-center gap-2 ${
          toast.kind === 'ok'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {toast.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </AppLayout>
  )
}
