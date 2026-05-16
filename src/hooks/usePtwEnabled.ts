import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Feature flag `app_config.ptw_enabled` (C3 Apple re-review staging gate).
// Read via SECURITY DEFINER RPC `get_ptw_enabled` because `app_config`
// has RLS "deny all" — only admins can mutate it via `set_ptw_enabled`.
//
// Refetched on auth state change (login/logout) so the flag tracks the
// current session. Admin toggles in AdminProjects can call `refresh()`
// to pick up changes without page reload.

export function usePtwEnabled(): {
  enabled: boolean
  loading: boolean
  refresh: () => Promise<void>
  setEnabled: (v: boolean) => Promise<{ error: string | null }>
} {
  const [enabled, setEnabledState] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_ptw_enabled')
    if (!error && typeof data === 'boolean') setEnabledState(data)
    else setEnabledState(false)
    setLoading(false)
  }, [])

  const setEnabled = useCallback(async (v: boolean) => {
    const { data, error } = await supabase.rpc('set_ptw_enabled', { p_enabled: v })
    if (error) return { error: error.message }
    if (typeof data === 'boolean') setEnabledState(data)
    return { error: null }
  }, [])

  useEffect(() => {
    refresh()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh()
    })
    return () => { sub.subscription.unsubscribe() }
  }, [refresh])

  return { enabled, loading, refresh, setEnabled }
}
