import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { Delegation } from '../types'

interface DelegationsContextValue {
  myDelegations: Delegation[]      // I am the grantor (user_id = me)
  delegationsToMe: Delegation[]    // I am the delegate (delegate_to = me)
  loading: boolean
  addDelegation: (delegate_to: string, valid_from: string, valid_until: string) => Promise<{ error: string | null }>
  removeDelegation: (id: string) => Promise<{ error: string | null }>
  refetch: () => Promise<void>
}

const DelegationsContext = createContext<DelegationsContextValue | null>(null)

export function DelegationsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [myDelegations, setMy] = useState<Delegation[]>([])
  const [delegationsToMe, setToMe] = useState<Delegation[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!profile) {
      setMy([])
      setToMe([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [g, t] = await Promise.all([
      supabase.from('delegations').select('*').eq('user_id', profile.id).order('valid_from', { ascending: false }),
      supabase.from('delegations').select('*').eq('delegate_to', profile.id).order('valid_from', { ascending: false }),
    ])
    setMy((g.data || []) as Delegation[])
    setToMe((t.data || []) as Delegation[])
    setLoading(false)
  }, [profile])

  useEffect(() => {
    refetch()
    if (!profile) return
    const ch = supabase
      .channel(`delegations-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delegations' }, () => refetch())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile, refetch])

  const addDelegation = useCallback(async (delegate_to: string, valid_from: string, valid_until: string) => {
    if (!profile) return { error: '未登入' }
    if (delegate_to === profile.id) return { error: '不能授權給自己' }
    const { error } = await supabase
      .from('delegations')
      .insert({ user_id: profile.id, delegate_to, valid_from, valid_until })
    return { error: error?.message ?? null }
  }, [profile])

  const removeDelegation = useCallback(async (id: string) => {
    const { error } = await supabase.from('delegations').delete().eq('id', id)
    return { error: error?.message ?? null }
  }, [])

  return (
    <DelegationsContext.Provider value={{
      myDelegations,
      delegationsToMe,
      loading,
      addDelegation,
      removeDelegation,
      refetch,
    }}>
      {children}
    </DelegationsContext.Provider>
  )
}

export function useDelegations(): DelegationsContextValue {
  const ctx = useContext(DelegationsContext)
  if (!ctx) throw new Error('useDelegations must be used within <DelegationsProvider>')
  return ctx
}
