import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'

// ── Material domain types ───────────────────────────────────────────────
// `status` is a GENERATED column in Postgres derived from qty_arrived vs qty_needed.
// "late" is NOT stored — compute via isMaterialLate() at render time.
export type MaterialStatus = 'arrived' | 'partial' | 'requested'

export interface Material {
  id: string
  project_id: string
  name: string
  unit: string
  qty_needed: number
  qty_arrived: number
  item_ids: string[]
  requested_by: string | null
  planned_arrival_at: string | null
  arrived_at: string | null
  notes: string | null
  urgent: boolean
  created_at: string
  updated_at: string
  status: MaterialStatus
}

export const MATERIAL_STATUS_ZH: Record<MaterialStatus, string> = {
  requested: '已申請',
  partial: '部分到貨',
  arrived: '已齊料',
}

// Tailwind classes for the status pill. Matches the IssueCard idiom.
export const MATERIAL_STATUS_BADGE_CLASS: Record<MaterialStatus, string> = {
  requested: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-50 text-blue-700',
  arrived: 'bg-green-100 text-green-700',
}

// Pseudo-status: a 'requested' material whose planned arrival is in the past.
// Computed client-side so the UI can flag overdue deliveries without a DB column.
export function isMaterialLate(m: Material): boolean {
  if (m.status !== 'requested') return false
  if (!m.planned_arrival_at) return false
  return new Date(m.planned_arrival_at).getTime() < Date.now()
}

// ── Payload shapes for mutations ────────────────────────────────────────
export interface CreateMaterialInput {
  name: string
  unit: string
  qty_needed: number
  item_ids?: string[]
  planned_arrival_at?: string | null
  notes?: string | null
  urgent?: boolean
}

export interface UpdateMaterialPatch {
  name?: string
  unit?: string
  qty_needed?: number
  item_ids?: string[]
  planned_arrival_at?: string | null
  notes?: string | null
  urgent?: boolean
}

interface MaterialsContextValue {
  materials: Material[]
  loading: boolean
  fetchError: string | null
  canManage: boolean
  refresh: () => Promise<void>
  createMaterial: (input: CreateMaterialInput) => Promise<{ id: string | null; error: string | null }>
  updateMaterial: (id: string, patch: UpdateMaterialPatch) => Promise<{ error: string | null }>
  receiveMaterial: (id: string, qty: number) => Promise<{ error: string | null }>
  deleteMaterial: (id: string) => Promise<{ error: string | null }>
}

const MaterialsContext = createContext<MaterialsContextValue | null>(null)

export function MaterialsProvider({
  projectId,
  children,
}: {
  projectId: string
  children: ReactNode
}) {
  const { profile } = useAuth()
  const { memberships, projects } = useProjects()
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Same role group as the RLS INSERT/UPDATE policy:
  // admin OR assigned PM OR approved membership in pm|main_contractor|subcontractor.
  const canManage = useMemo(() => {
    if (!profile) return false
    if (profile.global_role === 'admin') return true
    const project = projects.find(p => p.id === projectId)
    if (project?.assigned_pm_ids.includes(profile.id)) return true
    const myMembership = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved',
    )
    if (myMembership && ['pm', 'main_contractor', 'general_foreman', 'subcontractor'].includes(myMembership.role)) {
      return true
    }
    return false
  }, [profile, projects, memberships, projectId])

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('materials fetch error:', error)
      setFetchError(error.message)
      return
    }
    setMaterials((data ?? []) as Material[])
    setFetchError(null)
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
    const ch = supabase
      .channel(`materials-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'materials', filter: `project_id=eq.${projectId}` },
        () => refresh(),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [projectId, refresh])

  const createMaterial = useCallback(
    async (input: CreateMaterialInput) => {
      if (!profile) return { id: null, error: '未登入' }
      const row = {
        project_id: projectId,
        name: input.name.trim(),
        unit: input.unit.trim(),
        qty_needed: input.qty_needed,
        item_ids: input.item_ids ?? [],
        planned_arrival_at: input.planned_arrival_at ?? null,
        notes: input.notes?.trim() || null,
        urgent: input.urgent ?? false,
        requested_by: profile.id,
      }
      const { data, error } = await supabase
        .from('materials')
        .insert(row)
        .select('id')
        .single()
      if (error) {
        console.error('materials insert error:', error)
        return { id: null, error: error.message }
      }
      return { id: data.id, error: null }
    },
    [profile, projectId],
  )

  const updateMaterial = useCallback(
    async (id: string, patch: UpdateMaterialPatch) => {
      const cleaned: Record<string, unknown> = {}
      if (patch.name !== undefined) cleaned.name = patch.name.trim()
      if (patch.unit !== undefined) cleaned.unit = patch.unit.trim()
      if (patch.qty_needed !== undefined) cleaned.qty_needed = patch.qty_needed
      if (patch.item_ids !== undefined) cleaned.item_ids = patch.item_ids
      if (patch.planned_arrival_at !== undefined) cleaned.planned_arrival_at = patch.planned_arrival_at
      if (patch.notes !== undefined) cleaned.notes = patch.notes?.trim() || null
      if (patch.urgent !== undefined) cleaned.urgent = patch.urgent
      const { error } = await supabase.from('materials').update(cleaned).eq('id', id)
      if (error) {
        console.error('materials update error:', error)
        return { error: error.message }
      }
      return { error: null }
    },
    [],
  )

  // Add `qty` to qty_arrived. The DB GENERATED column will recompute status.
  // We also stamp arrived_at when this brings the total to >= qty_needed.
  const receiveMaterial = useCallback(
    async (id: string, qty: number) => {
      if (qty <= 0) return { error: '到貨數量需大於零' }
      const current = materials.find(m => m.id === id)
      if (!current) return { error: '找不到該物料' }
      const nextArrived = Number(current.qty_arrived) + Number(qty)
      const fullyArrived = nextArrived >= Number(current.qty_needed)
      const { error } = await supabase
        .from('materials')
        .update({
          qty_arrived: nextArrived,
          arrived_at: fullyArrived ? new Date().toISOString() : current.arrived_at,
        })
        .eq('id', id)
      if (error) {
        console.error('materials receive error:', error)
        return { error: error.message }
      }
      return { error: null }
    },
    [materials],
  )

  const deleteMaterial = useCallback(async (id: string) => {
    const { error } = await supabase.from('materials').delete().eq('id', id)
    if (error) {
      console.error('materials delete error:', error)
      return { error: error.message }
    }
    return { error: null }
  }, [])

  const value: MaterialsContextValue = {
    materials,
    loading,
    fetchError,
    canManage,
    refresh,
    createMaterial,
    updateMaterial,
    receiveMaterial,
    deleteMaterial,
  }
  return <MaterialsContext.Provider value={value}>{children}</MaterialsContext.Provider>
}

export function useMaterials(): MaterialsContextValue {
  const ctx = useContext(MaterialsContext)
  if (!ctx) throw new Error('useMaterials must be used within <MaterialsProvider>')
  return ctx
}

// Optional variant that does not throw when the provider is missing.
// Used by ProgressItemCard so it can render outside a materials-aware subtree
// (e.g., dashboards) without breaking.
export function useMaterialsOptional(): MaterialsContextValue | null {
  return useContext(MaterialsContext)
}
