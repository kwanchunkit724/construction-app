import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRole: Role
}

const ROLE_ROUTE: Record<Role, string> = {
  'super-admin': '/admin',
  pm: '/pm', pe: '/pe', cp: '/cp', foreman: '/foreman', worker: '/worker',
  'sub-supervisor': '/sub-supervisor',
  qs: '/qs', 'site-agent': '/site-agent', 'doc-controller': '/doc-controller',
  qc: '/qc', procurement: '/procurement', er: '/er',
}

export default function ProtectedRoute({ children, allowedRole }: ProtectedRouteProps) {
  const { isAuthenticated, user, loading } = useAuth()
  const location = useLocation()

  // Still bootstrapping Supabase session — don't redirect yet
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: '#94a3b8', fontSize: 18 }}>
        載入中…
      </div>
    )
  }

  // Not logged in → go to login, remember where they wanted to go
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Logged in but wrong role → redirect to their own dashboard
  if (user.role !== allowedRole) {
    return <Navigate to={ROLE_ROUTE[user.role]} replace />
  }

  return <>{children}</>
}
