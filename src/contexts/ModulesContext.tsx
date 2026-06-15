import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import type { ModuleKey, ModuleState } from '../types'

// Per-project module switches (v59). An admin can turn any of the 13 surfaces
// OFF for a single project (進度 excepted — it is the non-disableable core).
// Backwards-compat is "absence = enabled": the get_project_modules RPC returns
// every catalogue key coalesced to true when no override row exists, and this
// context likewise treats unknown/loading keys as enabled so nothing hides
// until data explicitly says OFF.
//
// Scoped to a single projectId (mounted inside the per-project routes, mirroring
// ApprovalChainProvider). One realtime subscription on project_modules drives
// every gate for that project; an admin toggle reflects across the tree without
// each consumer re-fetching the RPC.

interface ModulesContextValue {
  isModuleEnabled: (key: ModuleKey) => boolean
  modules: Record<string, boolean>
  loading: boolean
}

const ModulesContext = createContext<ModulesContextValue | null>(null)

export function ModulesProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [modules, setModules] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_project_modules', { p_project_id: projectId })
    if (!error && Array.isArray(data)) {
      const next: Record<string, boolean> = {}
      ;(data as ModuleState[]).forEach(row => { next[row.module_key] = row.enabled })
      setModules(next)
    }
    // On error, leave `modules` as-is — isModuleEnabled defaults unknown keys to
    // true, so a failed fetch never hides a surface (fail-open by design).
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    refetch()
    const onChange = debounce(() => void refetch(), REFETCH_DEBOUNCE_MS)
    const ch = supabase
      .channel(`modules-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_modules', filter: `project_id=eq.${projectId}` }, onChange)
      .subscribe()
    return () => { onChange.cancel(); supabase.removeChannel(ch) }
  }, [projectId, refetch])

  // Default TRUE: unknown keys (not yet fetched, or absent from the RPC) and the
  // loading window both read as enabled — surfaces only hide once a row says off.
  const isModuleEnabled = useCallback((key: ModuleKey) => modules[key] !== false, [modules])

  return (
    <ModulesContext.Provider value={{ isModuleEnabled, modules, loading }}>
      {children}
    </ModulesContext.Provider>
  )
}

export function useModules(): ModulesContextValue {
  const ctx = useContext(ModulesContext)
  if (!ctx) throw new Error('useModules must be used within ModulesProvider')
  return ctx
}
