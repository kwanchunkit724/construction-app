import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { ProjectsProvider } from './contexts/ProjectsContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { FullPageSpinner } from './components/Spinner'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Projects from './pages/Projects'
import Profile from './pages/Profile'
import AdminProjects from './pages/AdminProjects'
import ProjectDetail from './pages/ProjectDetail'
import IssueDetail from './pages/IssueDetail'
import Dashboard from './pages/Dashboard'
import AdminUsers from './pages/AdminUsers'
import SiListPage from './pages/SiList'
import SiDetailPage from './pages/SiDetail'
import VoListPage from './pages/VoList'
import VoDetailPage from './pages/VoDetail'
import AdminProjectChainsPage from './pages/AdminProjectChains'
// Phase 3 PTW pages lazy-loaded — feature is admin-gated until app_config.ptw_enabled=true.
// Keep entry chunk lean for users who never touch PTW.
const PtwListPage = lazy(() => import('./pages/PtwList'))
const PtwDetailPage = lazy(() => import('./pages/PtwDetail'))
const PtwVerifyPage = lazy(() => import('./pages/PtwVerify'))

function lazyRoute(node: React.ReactNode) {
  return <Suspense fallback={<FullPageSpinner label="載入中..." />}>{node}</Suspense>
}

export default function App() {
  return (
    <AuthProvider>
      <ProjectsProvider>
        <HashRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminProjects /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/projects/:id/chains" element={<ProtectedRoute requireAdmin><AdminProjectChainsPage /></ProtectedRoute>} />
          <Route path="/project/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
          <Route path="/project/:id/issue/:issueId" element={<ProtectedRoute><IssueDetail /></ProtectedRoute>} />
          <Route path="/project/:id/si" element={<ProtectedRoute><SiListPage /></ProtectedRoute>} />
          <Route path="/project/:id/si/:siId" element={<ProtectedRoute><SiDetailPage /></ProtectedRoute>} />
          <Route path="/project/:id/vo" element={<ProtectedRoute><VoListPage /></ProtectedRoute>} />
          <Route path="/project/:id/vo/:voId" element={<ProtectedRoute><VoDetailPage /></ProtectedRoute>} />
          <Route path="/project/:id/ptw" element={<ProtectedRoute>{lazyRoute(<PtwListPage />)}</ProtectedRoute>} />
          <Route path="/project/:id/ptw/:ptwId" element={<ProtectedRoute>{lazyRoute(<PtwDetailPage />)}</ProtectedRoute>} />
          <Route path="/verify/:token" element={<ProtectedRoute>{lazyRoute(<PtwVerifyPage />)}</ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </HashRouter>
      </ProjectsProvider>
    </AuthProvider>
  )
}
