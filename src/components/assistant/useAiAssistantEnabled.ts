import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Tab gate: the 助理 tab only shows when AI is enabled for this project
// (global flag AND per-project opt-in AND membership) — the same RPC the Edge
// Function checks. Kept in its own tiny eager module so ProjectDetail can call
// it without pulling the (lazy-loaded) AssistantPanel chunk into the entry bundle.
export function useAiAssistantEnabled(projectId: string): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let alive = true
    supabase.rpc('ai_enabled_for_project', { p_project_id: projectId }).then(({ data }) => {
      if (alive) setOn(data === true)
    })
    return () => { alive = false }
  }, [projectId])
  return on
}
