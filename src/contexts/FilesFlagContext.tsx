import { createContext, useContext, ReactNode } from 'react'
import { useFilesEnabled } from '../hooks/useFilesEnabled'

// Wraps `useFilesEnabled` in a context so a single subscription drives every
// 文件 (documents register) UI gate (Sidebar entry, ProjectFiles card, item-
// panel 圖則→文件 swap, admin toggle). The admin toggle's `setEnabled` then
// immediately reflects across the tree without each site re-fetching the RPC.
// Verbatim clone of PtwFlagContext over the files flag (v40, §4.4).

type Ctx = ReturnType<typeof useFilesEnabled>

const FilesFlagContext = createContext<Ctx | null>(null)

export function FilesFlagProvider({ children }: { children: ReactNode }) {
  const value = useFilesEnabled()
  return <FilesFlagContext.Provider value={value}>{children}</FilesFlagContext.Provider>
}

export function useFilesFlag(): Ctx {
  const v = useContext(FilesFlagContext)
  if (!v) throw new Error('useFilesFlag must be used inside FilesFlagProvider')
  return v
}
