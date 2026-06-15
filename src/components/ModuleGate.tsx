import { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useModules } from '../contexts/ModulesContext'
import { FullPageSpinner } from './Spinner'
import type { ModuleKey } from '../types'

// Per-project module routes render only when get_project_modules reports the
// module enabled for this project. Admins bypass the gate so they can manage a
// project whose modules they've switched off (PTW / Files gate precedent).
//
// When disabled: bounce to the project home (/project/:id) so the route is
// unreachable and the surface is pixel-identical to a project that never had
// the module. Falls back to /home if there's no :id in context.
//
// Default-enabled: while the RPC is loading, isModuleEnabled returns true, so
// nothing flickers-then-hides — the gate only redirects once data says OFF.

export function ModuleGate({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { profile } = useAuth()
  const { isModuleEnabled, loading } = useModules()
  const { id } = useParams<{ id: string }>()

  if (loading) return <FullPageSpinner label="載入中..." />
  if (isModuleEnabled(module) || profile?.global_role === 'admin') return <>{children}</>
  return <Navigate to={id ? `/project/${id}` : '/home'} replace />
}
