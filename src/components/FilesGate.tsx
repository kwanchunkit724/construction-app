import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useFilesFlag } from '../contexts/FilesFlagContext'
import { FullPageSpinner } from './Spinner'

// Routes under /project/:id/files render only when app_config.files_enabled =
// true. Admins bypass the gate so they can pilot the 文件總覽 before it opens to
// the rest of the org (PTW precedent). Clone of PtwGate over the files flag.
//
// When disabled: fall through to project home so the route is unreachable and
// the whole documents-register surface is pixel-identical-to-today (flag OFF).

export function FilesGate({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { enabled, loading } = useFilesFlag()

  if (loading) return <FullPageSpinner label="載入中..." />
  if (enabled || profile?.global_role === 'admin') return <>{children}</>
  return <Navigate to="/home" replace />
}
