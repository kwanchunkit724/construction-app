import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { cacheGet, cacheSet, getOnline, subscribeOnline } from '../lib/offline'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import type { Project, ProjectMember, ProjectRole, ProjectType, Zone } from '../types'
import { templateFor } from '../lib/progressTemplates'

interface ProjectsContextType {
  loading: boolean
  projects: Project[]
  memberships: ProjectMember[]
  fetchError: string | null
  refetch: () => Promise<void>
  // Admin
  createProject: (name: string, zones: Zone[], projectType?: ProjectType) => Promise<{ error: string | null }>
  assignPMs: (projectId: string, pmIds: string[]) => Promise<{ error: string | null }>
  deleteProject: (projectId: string) => Promise<{ error: string | null }>
  // User
  applyToProject: (projectId: string, role: ProjectRole) => Promise<{ error: string | null }>
  // Approver
  approveMembership: (membershipId: string) => Promise<{ error: string | null }>
  rejectMembership: (membershipId: string) => Promise<{ error: string | null }>
}

const ProjectsContext = createContext<ProjectsContextType | null>(null)

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [memberships, setMemberships] = useState<ProjectMember[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!session) return
    const uid = session.user_id
    // Fast path: when we KNOW we're offline, serve last-synced data straight
    // from cache and skip the network — avoids postgrest-js retrying the
    // doomed request for several seconds before failing.
    if (!getOnline()) {
      const cp = cacheGet<Project[]>(`projects:${uid}`)
      const cm = cacheGet<ProjectMember[]>(`memberships:${uid}`)
      if (cp) setProjects(cp.data)
      if (cm) setMemberships(cm.data)
      if (cp || cm) { setFetchError(null); return }
    }
    const [projRes, memRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('project_members').select('*').order('applied_at', { ascending: false }),
    ])
    const errors: string[] = []
    if (projRes.error) {
      console.error('projects fetch error:', projRes.error)
      // Only fall back to cache when offline — never mask a real online
      // error (RLS/permission/expired token) as a stale cache hit.
      const cached = !getOnline() ? cacheGet<Project[]>(`projects:${uid}`) : null
      if (cached) setProjects(cached.data)
      else errors.push(`projects: ${projRes.error.message}`)
    } else {
      setProjects(projRes.data as Project[])
      cacheSet(`projects:${uid}`, projRes.data as Project[])
    }
    if (memRes.error) {
      console.error('memberships fetch error:', memRes.error)
      const cached = !getOnline() ? cacheGet<ProjectMember[]>(`memberships:${uid}`) : null
      if (cached) setMemberships(cached.data)
      else errors.push(`memberships: ${memRes.error.message}`)
    } else {
      setMemberships(memRes.data as ProjectMember[])
      cacheSet(`memberships:${uid}`, memRes.data as ProjectMember[])
    }
    setFetchError(errors.length ? errors.join(' | ') : null)
  }, [session])

  useEffect(() => {
    if (!session) {
      setProjects([])
      setMemberships([])
      setLoading(false)
      return
    }
    setLoading(true)
    refetch().finally(() => setLoading(false))

    // Coalesce bursts of change events into one refetch (see lib/realtime).
    const onChange = debounce(() => void refetch(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel('phase2-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, onChange)
      .subscribe()

    return () => { onChange.cancel(); supabase.removeChannel(channel) }
  }, [session, refetch])

  // Re-sync when connectivity returns: realtime doesn't replay events missed
  // while offline, so a reconnect must trigger a fresh fetch.
  useEffect(() => {
    if (!session) return
    return subscribeOnline(online => { if (online) void refetch() })
  }, [session, refetch])

  async function createProject(name: string, zones: Zone[], projectType: ProjectType = 'general') {
    if (!profile) return { error: '未登入' }
    // small_works (autoZone) ships with one implicit zone so the operator
    // never hits the "尚未設定分區" dead-end on a one-room job. For every
    // other type the admin-supplied zones are used as-is. Default 'general'
    // keeps the existing two-arg call path byte-identical.
    const template = templateFor(projectType)
    const effectiveZones: Zone[] = template.autoZone ? [{ id: 'A', name: '工地' }] : zones
    const { error } = await supabase.from('projects').insert({
      name: name.trim(),
      zones: effectiveZones,
      project_type: projectType,
      assigned_pm_ids: [],
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  async function assignPMs(projectId: string, pmIds: string[]) {
    const { error } = await supabase.from('projects')
      .update({ assigned_pm_ids: pmIds })
      .eq('id', projectId)
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  async function deleteProject(projectId: string) {
    const { error } = await supabase.from('projects').delete().eq('id', projectId)
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  async function applyToProject(projectId: string, role: ProjectRole) {
    if (!profile) return { error: '未登入' }
    const { error } = await supabase.from('project_members').insert({
      user_id: profile.id,
      project_id: projectId,
      role,
      status: 'pending',
    })
    if (error) {
      if (error.code === '23505') return { error: '你已申請過此工地' }
      return { error: error.message }
    }
    await refetch()
    return { error: null }
  }

  async function approveMembership(membershipId: string) {
    if (!profile) return { error: '未登入' }
    const { error } = await supabase.from('project_members')
      .update({
        status: 'approved',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', membershipId)
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  async function rejectMembership(membershipId: string) {
    if (!profile) return { error: '未登入' }
    const { error } = await supabase.from('project_members')
      .update({
        status: 'rejected',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', membershipId)
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  return (
    <ProjectsContext.Provider value={{
      loading, projects, memberships, fetchError, refetch,
      createProject, assignPMs, deleteProject,
      applyToProject,
      approveMembership, rejectMembership,
    }}>
      {children}
    </ProjectsContext.Provider>
  )
}

export function useProjects() {
  const ctx = useContext(ProjectsContext)
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider')
  return ctx
}
