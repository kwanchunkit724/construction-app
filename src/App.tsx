import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { lazy, Suspense, ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { AuthProvider } from './contexts/AuthContext'
import { StepUpProvider } from './contexts/StepUpContext'
import { SignReauthProvider } from './contexts/SignReauthContext'
import { ProjectsProvider } from './contexts/ProjectsContext'
import { PtwFlagProvider } from './contexts/PtwFlagContext'
import { FilesFlagProvider } from './contexts/FilesFlagContext'
import { ModulesProvider } from './contexts/ModulesContext'
import { PtwGate } from './components/PtwGate'
import { FilesGate } from './components/FilesGate'
import { ModuleGate } from './components/ModuleGate'
import type { ModuleKey } from './types'
import { ProtectedRoute } from './components/ProtectedRoute'
import { FullPageSpinner } from './components/Spinner'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Projects from './pages/Projects'
import Profile from './pages/Profile'
import AdminProjects from './pages/AdminProjects'
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

// ProjectDetail is the heaviest authed screen (progress tree + all its modals +
// the 助理 AI chat). Lazy-loaded so it stays out of the entry chunk (CI 800 KB guard).
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))

// Phase D documents register — lazy + flag-gated (app_config.files_enabled).
// Only resolves when files_enabled (admins bypass via FilesGate); when OFF the
// FilesGate redirects to /home so the route is unreachable and the surface is
// pixel-identical to today.
const ProjectFilesPage = lazy(() => import('./pages/ProjectFiles'))
// 待我審批 cross-project review feed (S8) — gated like the register.
const PendingReviewsPage = lazy(() => import('./pages/PendingReviews'))
// 資料完整性 — admin tamper-evident ledger verify/export (Security Phase 1).
const DataIntegrityPage = lazy(() => import('./pages/DataIntegrity'))
// v59 per-project module switches — admin-only toggle list (owned by 2C).
// Lazy so the admin-only surface stays out of the entry chunk.
const AdminProjectModulesPage = lazy(() => import('./pages/AdminProjectModules'))

// v1.2 feature pages — lazy so the entry chunk stays under the 800 KB CI
// guard. None of these load until the user actually opens the route.
const DailyListPage = lazy(() => import('./pages/DailyList'))
const DailyEditPage = lazy(() => import('./pages/DailyEdit'))
const MaterialListPage = lazy(() => import('./pages/MaterialList'))
const TimetablePage = lazy(() => import('./pages/TimetablePage'))
const ContactListPage = lazy(() => import('./pages/ContactList'))
const WeatherRecordPage = lazy(() => import('./pages/WeatherRecord'))

// 地盤表格管理 (statutory site forms + mobile e-signing, v55) — lazy + entry-
// gated. The migration ships forms_enabled=false; v55 ships no get_forms_enabled
// RPC, so (per the F2 plan) the surface is gated on canManage at the tab level
// rather than a dedicated route gate. The pages themselves load (RLS still
// enforces every read/write), so deep links work for credentialed signers.
const EquipmentListPage = lazy(() => import('./pages/EquipmentList'))
const EquipmentDetailPage = lazy(() => import('./pages/EquipmentDetail'))
// Equipment QR scan/verify (F3). Mirrors /verify/:token but forms has no flag
// gate (v55 ships no get_forms_enabled RPC) — just ProtectedRoute + RLS. The
// phone camera opens #/equipment-verify/<token> which deep-links here.
const EquipmentVerifyPage = lazy(() => import('./pages/EquipmentVerify'))

// 教學 (tutorial) catalogue — lazy so the 80KB tutorial dataset stays out of
// the entry chunk; only loaded when a user opens the help page.
const HelpPage = lazy(() => import('./pages/Help'))

// 二步驗證 (TOTP step-up) enrolment — lazy so the QR/MFA enrolment code only
// loads when a user opens /security-setup.
const SecuritySetupPage = lazy(() => import('./pages/SecuritySetup'))

// Mission control panel — public-read sales dashboard at /#/mission.
// Lazy so the entry chunk isn't bloated for users who never open it.
const MissionPage = lazy(() => import('./pages/Mission'))

// Public sales pages — marketing landing + A4 takeaway. No auth.
// Lazy so prospects' first paint isn't blocked, and the app entry chunk
// stays lean for logged-in users who never hit these.
const SellPage = lazy(() => import('./pages/Sell'))
const TakeawayPage = lazy(() => import('./pages/Takeaway'))

// Public in-app feature-showcase for live presentations (/#/demo). No auth —
// like /sell — so it opens straight up in front of a prospect. Lazy so it
// never weighs down the authed entry chunk.
const DemoPage = lazy(() => import('./pages/Demo'))

function lazyRoute(node: React.ReactNode) {
  return <Suspense fallback={<FullPageSpinner label="載入中..." />}>{node}</Suspense>
}

// Per-project module gating. The 13-surface catalogue (src/lib/modules.ts) can
// be switched off per project by an admin (進度 excepted — core). Each gated
// module route is wrapped here: ModulesProvider reads :id and drives a single
// get_project_modules subscription, ModuleGate redirects to the project home
// when the module is OFF (admins bypass). Default-enabled, so absence of a
// row / loading window keeps the surface visible (backwards-compat).
//
// Mounted INSIDE ProtectedRoute (auth first) — mirror PtwGate/FilesGate.
function ModuleRoute({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/home" replace />
  return (
    <ModulesProvider projectId={id}>
      <ModuleGate module={module}>{children}</ModuleGate>
    </ModulesProvider>
  )
}

// Sales/marketing surfaces (/mission, /sell, /takeaway) are WEB-ONLY tools
// for going out and selling the system — they must NOT ship inside the
// native iOS/Android app. Register those routes only on web (Vercel) builds;
// on native they fall through to the catch-all → /home.
//
// NOTE: do NOT use `typeof window.Capacitor !== 'undefined'` — Capacitor's
// web runtime ALSO defines that global (getPlatform() === 'web'). Only
// isNativePlatform() reliably distinguishes the native WebView from web.
const isNativeApp = Capacitor.isNativePlatform()

export default function App() {
  return (
    <AuthProvider>
      <StepUpProvider>
      <SignReauthProvider>
      <ProjectsProvider>
        <PtwFlagProvider>
        <FilesFlagProvider>
        <HashRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/security-setup" element={<ProtectedRoute>{lazyRoute(<SecuritySetupPage />)}</ProtectedRoute>} />
          <Route path="/help" element={<ProtectedRoute>{lazyRoute(<HelpPage />)}</ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminProjects /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/integrity" element={<ProtectedRoute requireAdmin>{lazyRoute(<DataIntegrityPage />)}</ProtectedRoute>} />
          <Route path="/admin/projects/:id/chains" element={<ProtectedRoute requireAdmin><AdminProjectChainsPage /></ProtectedRoute>} />
          {/* v59 per-project module switches — admin-only toggle list (page owned by 2C). */}
          <Route path="/admin/projects/:id/modules" element={<ProtectedRoute requireAdmin>{lazyRoute(<AdminProjectModulesPage />)}</ProtectedRoute>} />
          {/* ProjectDetail hosts the in-page tabs: 進度 (core, never gated), 問題,
              工地指令/變更指令 (si-vo), and 助理. These tab surfaces are gated inside
              ProjectDetail via useModules() (2B-tabs), not at the route — the route
              itself must stay open since 進度 is the non-disableable core.
              TODO(Phase 2E): the 助理 tab is gated by its own ai_enabled flag —
              fold the assistant ModuleKey in alongside that flag there. */}
          <Route path="/project/:id" element={<ProtectedRoute>{lazyRoute(<ProjectDetail />)}</ProtectedRoute>} />
          <Route path="/project/:id/issue/:issueId" element={<ProtectedRoute><ModuleRoute module="issues"><IssueDetail /></ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/si" element={<ProtectedRoute><ModuleRoute module="si"><SiListPage /></ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/si/:siId" element={<ProtectedRoute><ModuleRoute module="si"><SiDetailPage /></ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/vo" element={<ProtectedRoute><ModuleRoute module="vo"><VoListPage /></ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/vo/:voId" element={<ProtectedRoute><ModuleRoute module="vo"><VoDetailPage /></ModuleRoute></ProtectedRoute>} />
          {/* PTW composes ModuleGate (per-project switch) over PtwGate (org-wide app_config flag). */}
          <Route path="/project/:id/ptw" element={<ProtectedRoute><ModuleRoute module="ptw"><PtwGate>{lazyRoute(<PtwListPage />)}</PtwGate></ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/ptw/:ptwId" element={<ProtectedRoute><ModuleRoute module="ptw"><PtwGate>{lazyRoute(<PtwDetailPage />)}</PtwGate></ModuleRoute></ProtectedRoute>} />
          {/* /verify/:token has no :id (it's an equipment/permit deep-link), so it stays org-flag-gated only. */}
          <Route path="/verify/:token" element={<ProtectedRoute><PtwGate>{lazyRoute(<PtwVerifyPage />)}</PtwGate></ProtectedRoute>} />
          {/* Phase D documents register — composes ModuleGate (per-project 文件 switch) over
              FilesGate (org-wide files_enabled flag). /reviews is cross-project (no :id) so
              it stays FilesGate-only. */}
          <Route path="/project/:id/files" element={<ProtectedRoute><ModuleRoute module="documents"><FilesGate>{lazyRoute(<ProjectFilesPage />)}</FilesGate></ModuleRoute></ProtectedRoute>} />
          <Route path="/reviews" element={<ProtectedRoute><FilesGate>{lazyRoute(<PendingReviewsPage />)}</FilesGate></ProtectedRoute>} />
          {/* v1.2: site diary, on-site materials, and the unified timetable. Per-project module-gated. */}
          <Route path="/project/:id/daily" element={<ProtectedRoute><ModuleRoute module="dailies">{lazyRoute(<DailyListPage />)}</ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/daily/edit" element={<ProtectedRoute><ModuleRoute module="dailies">{lazyRoute(<DailyEditPage />)}</ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/materials" element={<ProtectedRoute><ModuleRoute module="materials">{lazyRoute(<MaterialListPage />)}</ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/timetable" element={<ProtectedRoute><ModuleRoute module="timetable">{lazyRoute(<TimetablePage />)}</ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/contacts" element={<ProtectedRoute><ModuleRoute module="contacts">{lazyRoute(<ContactListPage />)}</ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/weather" element={<ProtectedRoute><ModuleRoute module="weather">{lazyRoute(<WeatherRecordPage />)}</ModuleRoute></ProtectedRoute>} />
          {/* 地盤表格管理 — register + per-equipment forms / mobile e-signing. */}
          <Route path="/project/:id/equipment" element={<ProtectedRoute><ModuleRoute module="equipment">{lazyRoute(<EquipmentListPage />)}</ModuleRoute></ProtectedRoute>} />
          <Route path="/project/:id/equipment/:equipmentId" element={<ProtectedRoute><ModuleRoute module="equipment">{lazyRoute(<EquipmentDetailPage />)}</ModuleRoute></ProtectedRoute>} />
          {/* Equipment QR verify — login-gated only (no :id, no forms flag gate). */}
          <Route path="/equipment-verify/:token" element={<ProtectedRoute>{lazyRoute(<EquipmentVerifyPage />)}</ProtectedRoute>} />
          {/* Public sales surfaces — WEB-ONLY, never in the native app. */}
          {!isNativeApp && (
            <>
              <Route path="/mission" element={lazyRoute(<MissionPage />)} />
              <Route path="/sell" element={lazyRoute(<SellPage />)} />
              <Route path="/demo" element={lazyRoute(<DemoPage />)} />
              <Route path="/takeaway" element={lazyRoute(<TakeawayPage />)} />
            </>
          )}
          <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </HashRouter>
        </FilesFlagProvider>
        </PtwFlagProvider>
      </ProjectsProvider>
      </SignReauthProvider>
      </StepUpProvider>
    </AuthProvider>
  )
}
