import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProjectsProvider } from './contexts/ProjectsContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Projects from './pages/Projects'
import Profile from './pages/Profile'
import AdminProjects from './pages/AdminProjects'
import ProjectDetail from './pages/ProjectDetail'
import IssueDetail from './pages/IssueDetail'

export default function App() {
  return (
    <AuthProvider>
      <ProjectsProvider>
        <HashRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminProjects /></ProtectedRoute>} />
          <Route path="/project/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
          <Route path="/project/:id/issue/:issueId" element={<ProtectedRoute><IssueDetail /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </HashRouter>
      </ProjectsProvider>
    </AuthProvider>
  )
}
