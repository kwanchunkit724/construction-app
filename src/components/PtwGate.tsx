import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePtwFlag } from '../contexts/PtwFlagContext'
import { FullPageSpinner } from './Spinner'

// Routes under /project/:id/ptw* + /verify/:token render only when
// app_config.ptw_enabled = true. Admins bypass the gate so they can
// pilot the feature before opening it to the rest of the org.
//
// When disabled: bounce to project home (or /home if no project context).

export function PtwGate({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { enabled, loading } = usePtwFlag()

  if (loading) return <FullPageSpinner label="載入中..." />
  if (enabled || profile?.global_role === 'admin') return <>{children}</>
  return <Navigate to="/home" replace />
}
