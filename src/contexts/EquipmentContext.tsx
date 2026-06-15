import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import { useStepUp } from './StepUpContext'
import { useSignReauth } from './SignReauthContext'
import { cacheGet, cacheSet, getOnline } from '../lib/offline'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import type {
  Equipment, FormInstance, FormSignoff, FormTemplate, FormsDashboard, FormSignoffResult, UserProfile,
} from '../types'

// 地盤表格管理 context. Scoped to a projectId, realtime channel
// `equipment-${projectId}`. Mirrors DocumentsContext / PtwContext: owns the
// equipment register + form_instances + signoffs + the seeded form_templates,
// plus the dashboard RPC and the three mutations (addEquipment / addInstance /
// signOff). All inserts respect the v55 RLS posture — form_signoffs is RPC-only
// (record_form_signoff), never a direct insert.

interface AddEquipmentInput {
  kind: string
  name_zh: string
  brand_model?: string | null
  serial_no?: string | null
  location_zh?: string | null
}

interface EquipmentContextValue {
  projectId: string
  loading: boolean
  fetchError: string | null
  equipment: Equipment[]
  instances: FormInstance[]
  signoffsByInstance: Record<string, FormSignoff[]>
  templates: FormTemplate[]
  templateById: Record<string, FormTemplate>
  dashboard: FormsDashboard | null
  // admin OR assigned PM OR approved pm/main_contractor/safety_officer member.
  canManage: boolean

  refetch: () => Promise<void>
  // 匯出登記冊: assembles the full register (equipment + instances + signoffs +
  // dashboard) plus a signer-name map, then hands it to exportEquipmentRegister.
  exportRegister: () => Promise<{ error: string | null }>
  addEquipment: (input: AddEquipmentInput) => Promise<{ id: string | null; error: string | null }>
  addInstance: (
    equipmentId: string,
    templateId: string,
    locationZh?: string | null,
  ) => Promise<{ id: string | null; error: string | null }>
  // Step-up gated (form_signoff) → record_form_signoff RPC. Returns the new
  // signoff id so the caller can attach a PDF replica afterwards.
  signOff: (
    instanceId: string,
    result: FormSignoffResult,
    payload: Record<string, unknown>,
    signatureB64: string,
  ) => Promise<{ id: string | null; error: string | null }>
}

const EquipmentContext = createContext<EquipmentContextValue | null>(null)

export function EquipmentProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const { memberships, projects } = useProjects()
  const { requireStepUp } = useStepUp()
  const { requireSignReauth } = useSignReauth()
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [instances, setInstances] = useState<FormInstance[]>([])
  const [signoffsByInstance, setSignoffsByInstance] = useState<Record<string, FormSignoff[]>>({})
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [dashboard, setDashboard] = useState<FormsDashboard | null>(null)

  // Mirrors the equipment_register INSERT RLS in v55: can_edit_project_progress
  // AND an approved membership with role in (pm, main_contractor,
  // safety_officer). admin / assigned PM short-circuit via
  // can_edit_project_progress. Per-project MEMBERSHIP governs this (not the
  // global account role), so workers / owner are correctly excluded.
  const canManage = useMemo(() => {
    if (!profile) return false
    if (profile.global_role === 'admin') return true
    const project = projects.find(p => p.id === projectId)
    if (project?.assigned_pm_ids.includes(profile.id)) return true
    const myMembership = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved',
    )
    return !!myMembership && ['pm', 'main_contractor', 'safety_officer'].includes(myMembership.role)
  }, [profile, projects, memberships, projectId])

  const templateById = useMemo(() => {
    const m: Record<string, FormTemplate> = {}
    templates.forEach(t => { m[t.id] = t })
    return m
  }, [templates])

  const refetch = useCallback(async () => {
    // Fast path: known offline → serve last-synced register, skip the network.
    if (!getOnline()) {
      const cachedEq = cacheGet<Equipment[]>(`equipment:${projectId}`)
      const cachedInst = cacheGet<FormInstance[]>(`form-instances:${projectId}`)
      if (cachedEq) setEquipment(cachedEq.data)
      if (cachedInst) setInstances(cachedInst.data)
      setFetchError(null)
      return
    }

    // Templates are shared reference data (readable by any authenticated user).
    const [eqRes, instRes, tmplRes, dashRes] = await Promise.all([
      supabase.from('equipment_register').select('*')
        .eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('form_instances').select('*')
        .eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('form_templates').select('*').eq('active', true).order('code'),
      supabase.rpc('get_forms_dashboard', { p_project_id: projectId }),
    ])

    if (eqRes.error) {
      console.error('equipment_register fetch error:', eqRes.error)
      const cached = !getOnline() ? cacheGet<Equipment[]>(`equipment:${projectId}`) : null
      if (cached) { setEquipment(cached.data); setFetchError(null) }
      else { setFetchError(eqRes.error.message) }
    } else {
      const eqs = (eqRes.data || []) as Equipment[]
      setEquipment(eqs)
      cacheSet(`equipment:${projectId}`, eqs)
      setFetchError(null)
    }

    if (instRes.error) {
      console.error('form_instances fetch error:', instRes.error)
    } else {
      const insts = (instRes.data || []) as FormInstance[]
      setInstances(insts)
      cacheSet(`form-instances:${projectId}`, insts)

      // Signoffs for these instances — one round-trip filtered by project.
      const sRes = await supabase
        .from('form_signoffs').select('*')
        .eq('project_id', projectId)
        .order('signed_at', { ascending: false })
      if (sRes.error) {
        console.error('form_signoffs fetch error:', sRes.error)
      } else {
        const smap: Record<string, FormSignoff[]> = {}
        ;(sRes.data || []).forEach((s: any) => {
          (smap[(s as FormSignoff).instance_id] ||= []).push(s as FormSignoff)
        })
        setSignoffsByInstance(smap)
      }
    }

    if (tmplRes.error) console.error('form_templates fetch error:', tmplRes.error)
    else setTemplates((tmplRes.data || []) as FormTemplate[])

    if (dashRes.error) console.error('get_forms_dashboard error:', dashRes.error)
    else if (dashRes.data) setDashboard(dashRes.data as unknown as FormsDashboard)
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    refetch().finally(() => setLoading(false))

    // Realtime: project-scoped equipment + instances + signoffs. Single channel
    // per project, debounced to coalesce write bursts (a signoff updates the
    // instance too → two rows; the debounce collapses them into one refetch).
    const onChange = debounce(() => void refetch(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`equipment-${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'equipment_register', filter: `project_id=eq.${projectId}` },
        onChange)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'form_instances', filter: `project_id=eq.${projectId}` },
        onChange)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'form_signoffs', filter: `project_id=eq.${projectId}` },
        onChange)
      .subscribe()

    return () => { onChange.cancel(); supabase.removeChannel(channel) }
  }, [projectId, refetch])

  const addEquipment = useCallback(async (input: AddEquipmentInput) => {
    if (!profile) return { id: null, error: '未登入' }
    if (!input.name_zh.trim()) return { id: null, error: '請輸入機械名稱' }
    // Allocate the per-project ref (EQ-001) through the definer RPC (mirrors
    // next_ptw_number). The RPC re-checks can_edit_project_progress server-side.
    const { data: refData, error: refErr } = await supabase.rpc('next_equipment_ref', { p_project_id: projectId })
    if (refErr || !refData) {
      if (refErr?.message?.includes('沒有權限')) return { id: null, error: '沒有權限新增機械' }
      return { id: null, error: refErr?.message || '產生機械編號失敗' }
    }
    const { data, error } = await supabase
      .from('equipment_register')
      .insert({
        project_id: projectId,
        kind: input.kind,
        ref_no: refData as unknown as string,
        name_zh: input.name_zh.trim(),
        brand_model: input.brand_model?.trim() || null,
        serial_no: input.serial_no?.trim() || null,
        location_zh: input.location_zh?.trim() || null,
        created_by: profile.id,
      })
      .select('id')
      .single()
    if (error) {
      if (error.message.toLowerCase().includes('row-level security')) {
        return { id: null, error: '沒有權限新增機械' }
      }
      return { id: null, error: error.message }
    }
    await refetch()
    return { id: data.id as string, error: null }
  }, [profile, projectId, refetch])

  const addInstance = useCallback(async (
    equipmentId: string,
    templateId: string,
    locationZh?: string | null,
  ) => {
    if (!profile) return { id: null, error: '未登入' }
    const { data, error } = await supabase
      .from('form_instances')
      .insert({
        project_id: projectId,
        equipment_id: equipmentId,
        template_id: templateId,
        location_zh: locationZh?.trim() || null,
        created_by: profile.id,
      })
      .select('id')
      .single()
    if (error) {
      if (error.message.includes('form_instances_equipment_id_template_id_key')
        || error.message.toLowerCase().includes('duplicate')) {
        return { id: null, error: '此機械已加入相同表格' }
      }
      if (error.message.toLowerCase().includes('row-level security')) {
        return { id: null, error: '沒有權限新增表格' }
      }
      return { id: null, error: error.message }
    }
    await refetch()
    return { id: data.id as string, error: null }
  }, [profile, projectId, refetch])

  const signOff = useCallback(async (
    instanceId: string,
    result: FormSignoffResult,
    payload: Record<string, unknown>,
    signatureB64: string,
  ) => {
    if (!profile) return { id: null, error: '未登入' }
    // Step-up BEFORE the RPC (server re-asserts assert_step_up('form_signoff')).
    // requireStepUp returns false on cancel / no-2FA → abort, surface no error.
    const ok = await requireStepUp('form_signoff')
    if (!ok) return { id: null, error: null }
    // Sign re-auth (#9) after the step-up gate, before the RPC: when enforcement
    // is ON, the signer re-enters their login password so the statutory-form
    // signature stands up as 本人 for a 勞工處 dispute. record_form_signoff
    // re-asserts assert_sign_reauth server-side, so a false here (cancel / wrong
    // password) MUST abort — surface a clean cancel like the step-up path does.
    const reauthOk = await requireSignReauth()
    if (!reauthOk) return { id: null, error: null }
    const { data, error } = await supabase.rpc('record_form_signoff', {
      p_instance_id: instanceId,
      p_result: result,
      p_payload: payload,
      p_signature_b64: signatureB64,
    })
    if (error) return { id: null, error: error.message }
    await refetch()
    return { id: (data as unknown as string) ?? null, error: null }
  }, [profile, requireStepUp, requireSignReauth, refetch])

  // 匯出登記冊 → Excel. The context already holds equipment / instances /
  // signoffs / dashboard / templateById; the only missing piece is a signer-name
  // map. Resolve it from user_profiles by the distinct signed_by ids (same
  // round-trip shape as VerifyCredentialsPanel). RLS may hide ex-members — that's
  // fine, exportEquipmentRegister falls back to '前成員' for unresolved ids.
  const exportRegister = useCallback(async () => {
    const project = projects.find(p => p.id === projectId)
    if (!project) return { error: '找不到項目' }
    const signerIds = Array.from(new Set(
      Object.values(signoffsByInstance).flat().map(s => s.signed_by).filter(Boolean),
    ))
    const users: Record<string, UserProfile> = {}
    if (signerIds.length > 0) {
      const { data: profs } = await supabase
        .from('user_profiles').select('id, name').in('id', signerIds)
      ;(profs || []).forEach((p: any) => { users[p.id] = { id: p.id, name: p.name } as UserProfile })
    }
    try {
      const { exportEquipmentRegister } = await import('../lib/export')
      await exportEquipmentRegister(
        project, equipment, instances, signoffsByInstance, templateById, dashboard, users,
      )
      return { error: null }
    } catch (e: any) {
      console.error('exportEquipmentRegister error:', e)
      return { error: e?.message || '匯出失敗' }
    }
  }, [projects, projectId, equipment, instances, signoffsByInstance, templateById, dashboard])

  const value: EquipmentContextValue = {
    projectId,
    loading,
    fetchError,
    equipment,
    instances,
    signoffsByInstance,
    templates,
    templateById,
    dashboard,
    canManage,
    refetch,
    exportRegister,
    addEquipment,
    addInstance,
    signOff,
  }

  return <EquipmentContext.Provider value={value}>{children}</EquipmentContext.Provider>
}

export function useEquipment(): EquipmentContextValue {
  const ctx = useContext(EquipmentContext)
  if (!ctx) throw new Error('useEquipment must be used inside EquipmentProvider')
  return ctx
}
