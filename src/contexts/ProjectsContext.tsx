import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { Project, ProjectMember, ProjectRole, Zone } from '../types'

interface ProjectsContextType {
  loading: boolean
  projects: Project[]
  memberships: ProjectMember[]
  refetch: () => Promise<void>
  // Admin
  createProject: (name: string, zones: Zone[]) => Promise<{ error: string | null }>
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

  const refetch = useCallback(async () => {
    if (!session) return
    const [projRes, memRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('project_members').select('*').order('applied_at', { ascending: false }),
    ])
    if (projRes.error) console.error('projects:', projRes.error)
    else setProjects(projRes.data as Project[])
    if (memRes.error) console.error('memberships:', memRes.error)
    else setMemberships(memRes.data as ProjectMember[])
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

    const channel = supabase
      .channel('phase2-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, () => refetch())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session, refetch])

  async function createProject(name: string, zones: Zone[]) {
    if (!profile) return { error: '未登入' }
    const { error } = await supabase.from('projects').insert({
      name: name.trim(),
      zones,
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
      loading, projects, memberships, refetch,
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
