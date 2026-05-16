import { createContext, useContext, ReactNode } from 'react'
import { usePtwEnabled } from '../hooks/usePtwEnabled'

// Wraps `usePtwEnabled` in a context so a single subscription drives every
// PTW UI gate (Sidebar entry, project SiVoSwitcher card, /ptw routes, admin
// toggle). The admin toggle's `setEnabled` then immediately reflects across
// the tree without each site re-fetching the RPC.

type Ctx = ReturnType<typeof usePtwEnabled>

const PtwFlagContext = createContext<Ctx | null>(null)

export function PtwFlagProvider({ children }: { children: ReactNode }) {
  const value = usePtwEnabled()
  return <PtwFlagContext.Provider value={value}>{children}</PtwFlagContext.Provider>
}

export function usePtwFlag(): Ctx {
  const v = useContext(PtwFlagContext)
  if (!v) throw new Error('usePtwFlag must be used inside PtwFlagProvider')
  return v
}
