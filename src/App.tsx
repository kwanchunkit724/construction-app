import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProgressProvider } from './context/ProgressContext'
import { IssueProvider } from './context/IssueContext'
import { SafetyProvider } from './context/SafetyContext'
import { QCProvider } from './context/QCContext'
import { DiaryProvider } from './context/DiaryContext'
import { ProcurementProvider } from './context/ProcurementContext'
import { CostProvider } from './context/CostContext'
import { DocumentProvider } from './context/DocumentContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import PMDashboard from './pages/PMDashboard'
import PEConsole from './pages/PEConsole'
import CPSafety from './pages/CPSafety'
import ForemanApp from './pages/ForemanApp'
import WorkerApp from './pages/WorkerApp'
import SubSupervisorApp from './pages/SubSupervisorApp'
import QSApp from './pages/QSApp'
import SiteAgentApp from './pages/SiteAgentApp'
import DocControlApp from './pages/DocControlApp'
import QCApp from './pages/QCApp'
import ProcurementApp from './pages/ProcurementApp'
import ERDashboard from './pages/ERDashboard'

export default function App() {
  return (
    <AuthProvider>
      <SafetyProvider>
      <QCProvider>
      <DiaryProvider>
      <ProcurementProvider>
      <CostProvider>
      <DocumentProvider>
      <IssueProvider>
      <ProgressProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/login" replace />} />

            <Route path="/admin" element={
              <ProtectedRoute allowedRole="super-admin"><SuperAdminDashboard /></ProtectedRoute>
            }/>
            <Route path="/pm" element={
              <ProtectedRoute allowedRole="pm"><PMDashboard /></ProtectedRoute>
            }/>
            <Route path="/pe" element={
              <ProtectedRoute allowedRole="pe"><PEConsole /></ProtectedRoute>
            }/>
            <Route path="/cp" element={
              <ProtectedRoute allowedRole="cp"><CPSafety /></ProtectedRoute>
            }/>
            <Route path="/foreman" element={
              <ProtectedRoute allowedRole="foreman"><ForemanApp /></ProtectedRoute>
            }/>
            <Route path="/worker" element={
              <ProtectedRoute allowedRole="worker"><WorkerApp /></ProtectedRoute>
            }/>
            <Route path="/sub-supervisor" element={
              <ProtectedRoute allowedRole="sub-supervisor"><SubSupervisorApp /></ProtectedRoute>
            }/>
            <Route path="/qs" element={
              <ProtectedRoute allowedRole="qs"><QSApp /></ProtectedRoute>
            }/>
            <Route path="/site-agent" element={
              <ProtectedRoute allowedRole="site-agent"><SiteAgentApp /></ProtectedRoute>
            }/>
            <Route path="/doc-controller" element={
              <ProtectedRoute allowedRole="doc-controller"><DocControlApp /></ProtectedRoute>
            }/>
            <Route path="/qc" element={
              <ProtectedRoute allowedRole="qc"><QCApp /></ProtectedRoute>
            }/>
            <Route path="/procurement" element={
              <ProtectedRoute allowedRole="procurement"><ProcurementApp /></ProtectedRoute>
            }/>
            <Route path="/er" element={
              <ProtectedRoute allowedRole="er"><ERDashboard /></ProtectedRoute>
            }/>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ProgressProvider>
      </IssueProvider>
      </DocumentProvider>
      </CostProvider>
      </ProcurementProvider>
      </DiaryProvider>
      </QCProvider>
      </SafetyProvider>
    </AuthProvider>
  )
}
