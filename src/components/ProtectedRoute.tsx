import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FullPageSpinner } from './Spinner'

export function ProtectedRoute({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { loading, session, profile } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner label="載入中..." />
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (requireAdmin && profile?.global_role !== 'admin') return <Navigate to="/home" replace />
  return <>{children}</>
}
