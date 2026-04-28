import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }: {
  children: React.ReactNode
  adminOnly?: boolean
}) {
  const { isAuthenticated, user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: '#94a3b8', fontSize: 18 }}>
        載入中…
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Admin-only route: redirect non-admins to dashboard
  if (adminOnly && user.role !== 'super-admin') {
    return <Navigate to="/dashboard" replace />
  }

  // Non-admin trying to access dashboard: redirect admin to admin panel
  if (!adminOnly && user.role === 'super-admin') {
    return <Navigate to="/admin" replace />
  }

  return <>{children}</>
}
