import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, RotateCcw, Save, CheckCircle2, AlertCircle } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { ChainStepRow } from '../components/admin/ChainStepRow'
import { ApprovalChainProvider, useApprovalChain } from '../contexts/ApprovalChainContext'
import type { DocType } from '../contexts/ApprovalChainContext'
import { useStepUp } from '../contexts/StepUpContext'
import { supabase } from '../lib/supabase'
import type { ChainStep, UserProfile, GlobalRole } from '../types'

const DOC_TYPE_LABEL: Record<DocType, string> = {
  si: '工地指令',
  vo: '變更指令',
  ptw: '工作許可證',
}

const DEFAULTS: Record<DocType, ChainStep[]> = {
  si: [
    { step_order: 0, required_role: 'main_contractor', optional_user_id: null },
    { step_order: 1, required_role: 'pm', optional_user_id: null },
  ],
  vo: [
    { step_order: 0, required_role: 'main_contractor', optional_user_id: null },
    { step_order: 1, required_role: 'pm', optional_user_id: null },
    { step_order: 2, required_role: 'owner', optional_user_id: null },
  ],
  // PTW Phase 3 default (safety_officer role lands in Phase 3 — referenced by string here)
  ptw: [
    { step_order: 0, required_role: 'safety_officer' as GlobalRole, optional_user_id: null },
    { step_order: 1, required_role: 'main_contractor', optional_user_id: null },
  ],
}

export default function AdminProjectChainsPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return (
    <ApprovalChainProvider projectId={id}>
      <AdminProjectChainsInner projectId={id} />
    </ApprovalChainProvider>
  )
}

function AdminProjectChainsInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { stepsByDocType, loading, canEdit, projectName, saveChain } = useApprovalChain()
  const { requireStepUp } = useStepUp()
  const [activeTab, setActiveTab] = useState<DocType>('si')
  const [workingSteps, setWorkingSteps] = useState<ChainStep[]>([])
  const [members, setMembers] = useState<UserProfile[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  // Reset working copy when active tab changes or context refreshes
  useEffect(() => {
    setWorkingSteps(stepsByDocType[activeTab].map(s => ({ ...s })))
  }, [activeTab, stepsByDocType])

  // Load project members for the optional_user_id picker
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: mems } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', projectId)
        .eq('status', 'approved')
      const { data: proj } = await supabase
        .from('projects')
        .select('assigned_pm_ids')
        .eq('id', projectId)
        .single()
      const ids = new Set<string>()
      ;(mems || []).forEach((m: any) => { if (m.user_id) ids.add(m.user_id) })
      ;((proj?.assigned_pm_ids as string[]) || []).forEach(p => ids.add(p))
      if (ids.size === 0) { if (!cancelled) setMembers([]); return }
      const { data: users } = await supabase
        .from('user_profiles')
        .select('*')
        .in('id', Array.from(ids))
      if (!cancelled) setMembers((users as UserProfile[]) || [])
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  const isPtw = activeTab === 'ptw'

  const dirty = useMemo(() => {
    const original = stepsByDocType[activeTab]
    if (original.length !== workingSteps.length) return true
    for (let i = 0; i < workingSteps.length; i++) {
      const a = workingSteps[i]
      const b = original[i]
      if (!b) return true
      if (a.required_role !== b.required_role || (a.optional_user_id || null) !== (b.optional_user_id || null)) return true
    }
    return false
  }, [stepsByDocType, activeTab, workingSteps])

  function move(idx: number, dir: -1 | 1) {
    const next = [...workingSteps]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    next.forEach((s, i) => { s.step_order = i })
    setWorkingSteps(next)
  }

  function addStep() {
    setWorkingSteps([
      ...workingSteps,
      { step_order: workingSteps.length, required_role: 'main_contractor', optional_user_id: null },
    ])
  }

  function removeStep(idx: number) {
    const next = workingSteps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i }))
    setWorkingSteps(next)
  }

  function loadDefaults() {
    setWorkingSteps(DEFAULTS[activeTab].map(s => ({ ...s })))
  }

  async function handleSave() {
    if (workingSteps.length === 0) {
      setToast({ kind: 'err', msg: '至少要有一個簽核步驟' })
      return
    }
    if (!(await requireStepUp('approval'))) return
    setSaving(true)
    setToast(null)
    const { error } = await saveChain(activeTab, workingSteps)
    setSaving(false)
    if (error) setToast({ kind: 'err', msg: `儲存失敗：${error}` })
    else setToast({ kind: 'ok', msg: '已儲存簽核流程' })
  }

  return (
    <AppLayout title="簽核流程設定" wide>
      <button
        onClick={() => navigate('/admin')}
        className="text-sm text-site-500 hover:text-site-900 inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft size={14} /> 返回管理
      </button>

      <div className="mb-4">
        <h2 className="text-lg font-bold text-site-900">
          簽核流程設定{projectName ? ` — ${projectName}` : ''}
        </h2>
        <p className="text-xs text-site-500 mt-0.5">
          設定 SI / VO / PTW 各自嘅審批順序。已提交嘅文件已凍結原有流程，不受此處修改影響。
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {(['si','vo','ptw'] as DocType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`text-sm font-semibold px-4 py-2 rounded-full border transition-colors whitespace-nowrap min-h-0 ${
              activeTab === t
                ? 'bg-safety-500 text-white border-safety-500'
                : 'bg-white text-site-600 border-site-200 hover:border-safety-300'
            }`}
          >
            {DOC_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {!canEdit && (
        <div className="bg-amber-50 text-amber-700 border border-amber-200 rounded-xl p-3 text-sm mb-3">
          只有管理員或本項目項目經理可以編輯簽核流程。下面以唯讀模式顯示。
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner size={28} /></div>
      ) : (
        <>
          <div className="space-y-2">
            {workingSteps.length === 0 ? (
              <div className="card p-8 text-center text-sm text-site-500">
                未有簽核步驟。按下方「預設範本」或「加入步驟」開始。
              </div>
            ) : (
              workingSteps.map((s, idx) => (
                <ChainStepRow
                  key={idx}
                  step={s}
                  index={idx}
                  isFirst={idx === 0}
                  isLast={idx === workingSteps.length - 1}
                  canRemove={canEdit && workingSteps.length > 1}
                  projectMembers={members}
                  onChange={next => {
                    const copy = [...workingSteps]
                    copy[idx] = next
                    setWorkingSteps(copy)
                  }}
                  onMoveUp={() => move(idx, -1)}
                  onMoveDown={() => move(idx, 1)}
                  onRemove={() => removeStep(idx)}
                />
              ))
            )}
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={addStep}
                className="btn-ghost flex items-center gap-1.5 flex-1 min-w-[140px] justify-center"
              >
                <Plus size={16} /> 加入步驟
              </button>
              <button
                onClick={loadDefaults}
                className="btn-ghost flex items-center gap-1.5 flex-1 min-w-[140px] justify-center"
              >
                <RotateCcw size={16} /> 預設範本
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="btn-primary flex items-center gap-1.5 flex-1 min-w-[140px] justify-center"
              >
                {saving ? <Spinner size={16} className="text-white" /> : <Save size={16} />}
                儲存
              </button>
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
        </>
      )}
    </AppLayout>
  )
}
