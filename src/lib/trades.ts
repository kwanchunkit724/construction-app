import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// v110 工種字典 (T1). Global industry taxonomy seeded in the DB (admin-managed),
// read-only for members. Cached module-wide — the dictionary changes ~never, so
// one fetch per session serves every card/picker/export.
export interface Trade {
  code: string
  name_zh: string
  group_zh: string
  acceptance_role: string | null
  sort_order: number
}

let cache: Trade[] | null = null
let inflight: Promise<Trade[]> | null = null

export function fetchTrades(): Promise<Trade[]> {
  if (cache) return Promise.resolve(cache)
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase.from('trades').select('*').order('sort_order')
    if (error) { console.error('trades fetch error:', error); inflight = null; return [] }
    cache = (data ?? []) as Trade[]
    inflight = null
    return cache
  })()
  return inflight
}

export function useTrades(): Trade[] {
  const [trades, setTrades] = useState<Trade[]>(cache ?? [])
  useEffect(() => {
    let alive = true
    fetchTrades().then(t => { if (alive) setTrades(t) })
    return () => { alive = false }
  }, [])
  return trades
}

export function tradeName(trades: Trade[], code: string | null | undefined): string | null {
  if (!code) return null
  return trades.find(t => t.code === code)?.name_zh ?? code
}
