import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { useAuth } from './AuthContext'

// Per-project contact directory (v1.3 / Plan 11).
//
// admin / pm curate the list; everyone in the project can read so
// the foreman can tap-to-call from site. Realtime kept simple — any
// row change refetches the whole project's contacts (n is small).

export interface Contact {
  id: string
  project_id: string
  name: string
  trade: string
  phone: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ContactInput {
  name: string
  trade: string
  phone: string
  notes?: string | null
}

// Suggested trade tags shown in a datalist. Users can type anything;
// these are just hints. zh-HK first because that's the project locale.
export const TRADE_SUGGESTIONS = [
  '電工',
  '水喉',
  '泥水',
  '紮鐵',
  '木工',
  '油漆',
  '燒焊',
  '鋁窗',
  '玻璃',
  '機電',
  '消防',
  '棚架',
  '吊運',
  '工程顧問',
  '物料供應',
  '清拆',
  '其他',
] as const

interface ContactsCtx {
  contacts: Contact[]
  loading: boolean
  error: string | null
  canManage: boolean
  refresh: () => Promise<void>
  createContact: (input: ContactInput) => Promise<{ error: string | null }>
  updateContact: (id: string, patch: Partial<ContactInput>) => Promise<{ error: string | null }>
  deleteContact: (id: string) => Promise<{ error: string | null }>
}

const Ctx = createContext<ContactsCtx | null>(null)

export function ContactsProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  // Mirror v11-contacts-schema.sql write policies (contacts_insert/update/delete):
  // write is locked to global_role in ('admin','pm'). Anyone else (incl.
  // general_foreman) is read-only — don't show write affordances that the
  // server would reject with an RLS error.
  const canManage = profile?.global_role === 'admin' || profile?.global_role === 'pm'

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('contacts')
      .select('*')
      .eq('project_id', projectIdRef.current)
      .order('trade')
      .order('name')
    if (err) {
      setError(err.message)
      setContacts([])
    } else {
      setContacts((data ?? []) as Contact[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh, projectId])

  useEffect(() => {
    const onChange = debounce(() => void refresh(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`contacts-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contacts', filter: `project_id=eq.${projectId}` },
        onChange,
      )
      .subscribe()
    return () => { onChange.cancel(); void supabase.removeChannel(channel) }
  }, [projectId, refresh])

  const createContact = useCallback(async (input: ContactInput) => {
    if (!profile) return { error: '未登入' }
    const { error: err } = await supabase.from('contacts').insert({
      project_id: projectId,
      name: input.name.trim(),
      trade: input.trade.trim(),
      phone: input.phone.trim(),
      notes: input.notes?.trim() || null,
      created_by: profile.id,
    })
    if (err) return { error: err.message }
    return { error: null }
  }, [profile, projectId])

  const updateContact = useCallback(async (id: string, patch: Partial<ContactInput>) => {
    const cleaned: Record<string, string | null> = {}
    if (patch.name !== undefined) cleaned.name = patch.name.trim()
    if (patch.trade !== undefined) cleaned.trade = patch.trade.trim()
    if (patch.phone !== undefined) cleaned.phone = patch.phone.trim()
    if (patch.notes !== undefined) cleaned.notes = patch.notes?.trim() || null
    const { error: err } = await supabase.from('contacts').update(cleaned).eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [])

  const deleteContact = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('contacts').delete().eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [])

  const value = useMemo<ContactsCtx>(() => ({
    contacts,
    loading,
    error,
    canManage,
    refresh,
    createContact,
    updateContact,
    deleteContact,
  }), [contacts, loading, error, canManage, refresh, createContact, updateContact, deleteContact])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useContacts() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useContacts must be used inside ContactsProvider')
  return ctx
}
