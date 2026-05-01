import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FullPageSpinner } from './Spinner'

export function ProtectedRoute({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { loading, session, profile } = useAuth()
  if (loading) return <FullPageSpinner label="載入中..." />
  if (!session) return <Navigate to="/login" replace />
  if (requireAdmin && profile?.global_role !== 'admin') return <Navigate to="/home" replace />
  return <>{children}</>
}
