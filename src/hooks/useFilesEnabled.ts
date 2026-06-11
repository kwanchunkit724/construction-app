import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Feature flag `app_config.files_enabled` (v40 documents register staging gate,
// FILE-SYSTEM-DESIGN §4.4). Clone of usePtwEnabled over the files RPCs.
// Read via SECURITY DEFINER RPC `get_files_enabled` because `app_config`
// has RLS "deny all" — only admins can mutate it via `set_files_enabled`.
//
// Ships false → the 文件 surface stays hidden until flipped server-side after
// App Store approval (PTW precedent). Refetched on auth state change
// (login/logout) so the flag tracks the current session. Admin toggles in
// AdminProjects can call `refresh()` to pick up changes without page reload.

export function useFilesEnabled(): {
  enabled: boolean
  loading: boolean
  refresh: () => Promise<void>
  setEnabled: (v: boolean) => Promise<{ error: string | null }>
} {
  const [enabled, setEnabledState] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_files_enabled')
    if (!error && typeof data === 'boolean') setEnabledState(data)
    else setEnabledState(false)
    setLoading(false)
  }, [])

  const setEnabled = useCallback(async (v: boolean) => {
    const { data, error } = await supabase.rpc('set_files_enabled', { p_enabled: v })
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
