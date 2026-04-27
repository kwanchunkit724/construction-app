import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { startPolling } from '../lib/syncUtils'
import { supabase } from '../lib/supabase'
import type { ProgressItem, SiteMessage, Project, ProjectModule } from '../types'

const ALL_MODULE_KEYS: ProjectModule[] = [
  'progress', 'issues', 'safety', 'diary', 'materials', 'documents', 'qc', 'procurement',
]

// ── Row mappers ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function projectFromRow(row: any): Project {
  return {
    id: row.id, name: row.name, description: row.description,
    createdBy: row.created_by, createdAt: row.created_at, status: row.status,
    projectType: row.project_type ?? 'building',
    numBlocks: row.num_blocks ?? 1, hasBasement: row.has_basement ?? false,
    numBasementLevels: row.num_basement_levels ?? 0,
    zones: row.zones ?? [], enabledModules: row.enabled_modules ?? ALL_MODULE_KEYS,
    client: row.client, startDate: row.start_date, targetEndDate: row.target_end_date,
    contractValue: row.contract_value, siteAddress: row.site_address,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function itemFromRow(row: any): ProgressItem {
  return {
    id: row.id, projectId: row.project_id, code: row.code ?? '',
    title: row.title, zone: row.zone ?? '', parentId: row.parent_id ?? null,
    level: row.level ?? 1, plannedStart: row.planned_start ?? '',
    plannedEnd: row.planned_end ?? '', plannedProgress: row.planned_progress ?? 0,
    actualProgress: row.actual_progress ?? 0, status: row.status ?? 'not-started',
    ownedBy: row.owned_by ?? [], delegatedTo: row.delegated_to ?? [],
    notes: row.notes ?? '', lastUpdatedBy: row.last_updated_by ?? '',
    lastUpdatedAt: row.last_updated_at ?? new Date().toISOString(),
    trackingMode: row.tracking_mode ?? 'percentage',
    floorLabels: row.floor_labels ?? [], floorsCompleted: row.floors_completed ?? [],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function itemToRow(item: ProgressItem) {
  return {
    id: item.id, project_id: item.projectId, code: item.code,
    title: item.title, zone: item.zone, parent_id: item.parentId,
    level: item.level, planned_start: item.plannedStart, planned_end: item.plannedEnd,
    planned_progress: item.plannedProgress, actual_progress: item.actualProgress,
    status: item.status, owned_by: item.ownedBy, delegated_to: item.delegatedTo,
    notes: item.notes, last_updated_by: item.lastUpdatedBy,
    last_updated_at: item.lastUpdatedAt, tracking_mode: item.trackingMode,
    floor_labels: item.floorLabels, floors_completed: item.floorsCompleted,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function msgFromRow(row: any): SiteMessage {
  return {
    id: row.id, type: row.type, from: row.from_user, fromName: row.from_name,
    fromRole: row.from_role, to: row.to_users ?? [], toNames: row.to_names ?? [],
    subject: row.subject, body: row.body, zone: row.zone,
    progressRef: row.progress_ref, sentAt: row.sent_at,
    readBy: row.read_by ?? [], attachments: row.attachments ?? [],
  }
}

// ── Roll-up (pure) ────────────────────────────────────────────────────────────
function rollUp(items: ProgressItem[]): ProgressItem[] {
  const map = new Map<string, ProgressItem>(items.map(i => [i.id, { ...i }]))
  const depthCache = new Map<string, number>()
  function getDepth(id: string): number {
    if (depthCache.has(id)) return depthCache.get(id)!
    const item = map.get(id)
    if (!item || item.parentId === null) { depthCache.set(id, 0); return 0 }
    const d = 1 + getDepth(item.parentId)
    depthCache.set(id, d)
    return d
  }
  map.forEach((_, id) => getDepth(id))
  const maxDepth = Math.max(0, ...depthCache.values())
  for (let depth = maxDepth; depth >= 1; depth--) {
    map.forEach(item => {
      if (depthCache.get(item.id) !== depth || item.parentId === null) return
      const parent = map.get(item.parentId)
      if (!parent) return
      const siblings = [...map.values()].filter(i => i.parentId === item.parentId)
      if (siblings.length === 0) return
      const avg = Math.round(siblings.reduce((s, c) => s + c.actualProgress, 0) / siblings.length)
      map.set(parent.id, {
        ...parent,
        actualProgress: avg,
        status: avg === 0 ? 'not-started' : avg === 100 ? 'completed'
          : avg < parent.plannedProgress - 5 ? 'delayed' : 'in-progress',
      })
    })
  }
  return [...map.values()]
}

// ── Context type ──────────────────────────────────────────────────────────────
interface ProgressContextType {
  projects: Project[]
  currentProjectId: string
  currentProject: Project | undefined
  createProject: (p: Omit<Project, 'id' | 'createdAt'>) => void
  switchProject: (id: string) => void
  updateProjectModules: (projectId: string, modules: ProjectModule[]) => void
  isModuleEnabled: (module: ProjectModule) => boolean
  items: ProgressItem[]
  updateProgress: (id: string, value: number, notes: string, byName: string) => void
  updateFloors: (id: string, floorsCompleted: string[], notes: string, byName: string) => void
  assignItem: (id: string, userIds: string[]) => void
  setDelegated: (id: string, userIds: string[]) => void
  delegateItem: (id: string, userId: string) => void
  addItem: (item: Omit<ProgressItem, 'id'>) => void
  deleteItem: (id: string) => void
  messages: SiteMessage[]
  sendMessage: (msg: Omit<SiteMessage, 'id' | 'sentAt' | 'readBy'>) => void
  markRead: (msgIds: string[], userId: string) => void
}

const Ctx = createContext<ProgressContextType | null>(null)

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProjectId, setCurrentProjectId] = useState('PROJ001')
  const [allItems, setAllItems] = useState<ProgressItem[]>([])
  const [messages, setMessages] = useState<SiteMessage[]>([])

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    const refetchProjects = () =>
      supabase.from('projects').select('*').order('created_at')
        .then(({ data }) => { if (data?.length) setProjects(data.map(projectFromRow)) })
    const refetchMessages = () =>
      supabase.from('site_messages').select('*').order('sent_at', { ascending: false })
        .then(({ data }) => { if (data) setMessages(data.map(msgFromRow)) })
    const stopProjects = startPolling(refetchProjects)
    const stopMessages = startPolling(refetchMessages)
    return () => { stopProjects(); stopMessages() }
  }, [])

  useEffect(() => {
    const fetchItems = () =>
      supabase.from('progress_items').select('*').eq('project_id', currentProjectId)
        .then(({ data }) => {
          if (data) setAllItems(prev => [
            ...prev.filter(i => i.projectId !== currentProjectId),
            ...rollUp(data.map(itemFromRow)),
          ])
        })
    return startPolling(fetchItems)
  }, [currentProjectId])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const items = allItems.filter(i => i.projectId === currentProjectId)

  const persistItems = (rolled: ProgressItem[]) => {
    supabase.from('progress_items').upsert(rolled.map(itemToRow))
      .then(({ error }) => { if (error) console.error(error) })
  }

  const applyRollUp = (updater: (prev: ProgressItem[]) => ProgressItem[]) => {
    setAllItems(prev => {
      const projectItems = prev.filter(i => i.projectId === currentProjectId)
      const otherItems   = prev.filter(i => i.projectId !== currentProjectId)
      const updated = updater(projectItems)
      const rolled  = rollUp(updated)
      persistItems(rolled)
      return [...otherItems, ...rolled]
    })
  }

  // ── Project actions ───────────────────────────────────────────────────────
  const createProject = (p: Omit<Project, 'id' | 'createdAt'>) => {
    const id = `PROJ${Date.now()}`
    const createdAt = new Date().toISOString()
    const newProject: Project = { ...p, id, createdAt, enabledModules: p.enabledModules ?? ALL_MODULE_KEYS }
    setProjects(prev => [...prev, newProject])
    setCurrentProjectId(id)
    supabase.from('projects').insert({
      id, name: p.name, description: p.description, created_by: p.createdBy,
      created_at: createdAt, status: p.status, project_type: p.projectType,
      num_blocks: p.numBlocks, has_basement: p.hasBasement,
      num_basement_levels: p.numBasementLevels, zones: p.zones,
      enabled_modules: newProject.enabledModules, client: p.client,
      start_date: p.startDate, target_end_date: p.targetEndDate,
      contract_value: p.contractValue, site_address: p.siteAddress,
    }).then(({ error }) => {
      if (error) { console.error(error); setProjects(prev => prev.filter(x => x.id !== id)) }
    })
  }

  const switchProject = (id: string) => setCurrentProjectId(id)

  const updateProjectModules = (projectId: string, modules: ProjectModule[]) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, enabledModules: modules } : p))
    supabase.from('projects').update({ enabled_modules: modules }).eq('id', projectId)
      .then(({ error }) => { if (error) console.error(error) })
  }

  const currentProject = projects.find(p => p.id === currentProjectId)
  const isModuleEnabled = (module: ProjectModule) =>
    currentProject?.enabledModules.includes(module) ?? true

  // ── Progress item actions ─────────────────────────────────────────────────
  const updateProgress = (id: string, value: number, notes: string, byName: string) => {
    applyRollUp(prev => prev.map(i => i.id === id ? {
      ...i, actualProgress: value, notes: notes || i.notes,
      lastUpdatedBy: byName, lastUpdatedAt: new Date().toISOString(),
      status: (value === 0 ? 'not-started' : value === 100 ? 'completed'
        : value < i.plannedProgress - 5 ? 'delayed' : 'in-progress') as ProgressItem['status'],
    } : i))
  }

  const updateFloors = (id: string, floorsCompleted: string[], notes: string, byName: string) => {
    applyRollUp(prev => prev.map(i => {
      if (i.id !== id) return i
      const pct = i.floorLabels.length > 0
        ? Math.round((floorsCompleted.length / i.floorLabels.length) * 100) : 0
      return {
        ...i, floorsCompleted, actualProgress: pct, notes: notes || i.notes,
        lastUpdatedBy: byName, lastUpdatedAt: new Date().toISOString(),
        status: (pct === 0 ? 'not-started' : pct === 100 ? 'completed'
          : pct < i.plannedProgress - 5 ? 'delayed' : 'in-progress') as ProgressItem['status'],
      }
    }))
  }

  const assignItem = (id: string, userIds: string[]) => {
    setAllItems(prev => prev.map(i => i.id === id ? { ...i, ownedBy: userIds } : i))
    supabase.from('progress_items').update({ owned_by: userIds }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  const setDelegated = (id: string, userIds: string[]) => {
    setAllItems(prev => prev.map(i => i.id === id ? { ...i, delegatedTo: userIds } : i))
    supabase.from('progress_items').update({ delegated_to: userIds }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  const delegateItem = (id: string, userId: string) => {
    setAllItems(prev => prev.map(i => {
      if (i.id !== id) return i
      const delegatedTo = i.delegatedTo.includes(userId) ? i.delegatedTo : [...i.delegatedTo, userId]
      supabase.from('progress_items').update({ delegated_to: delegatedTo }).eq('id', id)
        .then(({ error }) => { if (error) console.error(error) })
      return { ...i, delegatedTo }
    }))
  }

  const addItem = (item: Omit<ProgressItem, 'id'>) => {
    const id = `PI${Date.now()}`
    const newItem: ProgressItem = { ...item, id, projectId: currentProjectId }
    setAllItems(prev => rollUp([...prev, newItem]))
    supabase.from('progress_items').insert(itemToRow(newItem))
      .then(({ error }) => {
        if (error) { console.error(error); setAllItems(prev => prev.filter(i => i.id !== id)) }
      })
  }

  const deleteItem = (id: string) => {
    setAllItems(prev => {
      const toRemove = new Set<string>()
      const collect = (itemId: string) => {
        toRemove.add(itemId)
        prev.filter(i => i.parentId === itemId).forEach(c => collect(c.id))
      }
      collect(id)
      supabase.from('progress_items').delete().in('id', [...toRemove])
        .then(({ error }) => { if (error) console.error(error) })
      return rollUp(prev.filter(i => !toRemove.has(i.id)))
    })
  }

  // ── Message actions ───────────────────────────────────────────────────────
  const sendMessage = (msg: Omit<SiteMessage, 'id' | 'sentAt' | 'readBy'>) => {
    const id = `MSG${Date.now()}`
    const sentAt = new Date().toISOString()
    const newMsg: SiteMessage = { ...msg, id, sentAt, readBy: [msg.from] }
    setMessages(prev => [newMsg, ...prev])
    supabase.from('site_messages').insert({
      id, project_id: currentProjectId, type: msg.type,
      from_user: msg.from, from_name: msg.fromName, from_role: msg.fromRole,
      to_users: msg.to, to_names: msg.toNames, subject: msg.subject, body: msg.body,
      zone: msg.zone, progress_ref: msg.progressRef,
      sent_at: sentAt, read_by: [msg.from], attachments: msg.attachments ?? [],
    }).then(({ error }) => {
      if (error) { console.error(error); setMessages(prev => prev.filter(m => m.id !== id)) }
    })
  }

  const markRead = (msgIds: string[], userId: string) => {
    setMessages(prev => prev.map(m => {
      if (!msgIds.includes(m.id) || m.readBy.includes(userId)) return m
      const readBy = [...m.readBy, userId]
      supabase.from('site_messages').update({ read_by: readBy }).eq('id', m.id)
        .then(({ error }) => { if (error) console.error(error) })
      return { ...m, readBy }
    }))
  }

  return (
    <Ctx.Provider value={{
      projects, currentProjectId, currentProject, createProject, switchProject,
      updateProjectModules, isModuleEnabled,
      items, updateProgress, updateFloors, assignItem, setDelegated, delegateItem, addItem, deleteItem,
      messages, sendMessage, markRead,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useProgress(): ProgressContextType {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProgress must be inside <ProgressProvider>')
  return ctx
}
