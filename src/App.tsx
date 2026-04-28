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
import { ContractProvider } from './context/ContractContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import UnifiedDashboard from './pages/UnifiedDashboard'

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
      <ContractProvider>
      <ProgressProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/login" replace />} />

            <Route path="/admin" element={
              <ProtectedRoute adminOnly><SuperAdminDashboard /></ProtectedRoute>
            }/>

            <Route path="/dashboard" element={
              <ProtectedRoute><UnifiedDashboard /></ProtectedRoute>
            }/>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ProgressProvider>
      </ContractProvider>
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
