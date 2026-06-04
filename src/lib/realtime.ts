// Realtime scaling helpers.
//
// Every domain context opens a postgres_changes channel and refetches its
// whole dataset on ANY change. With many concurrent users + bursty writes
// (e.g. a foreman saving a daily diary fires several row changes), that
// produces a "refetch storm": one logical action → many full-table
// refetches per connected client. This coalesces a burst of change events
// into a SINGLE trailing refetch, cutting redundant REST round-trips and
// Supabase egress without losing freshness.

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 400): ((...args: A) => void) & { cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null
  const wrapped = (...args: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => { t = null; fn(...args) }, ms)
  }
  wrapped.cancel = () => { if (t) { clearTimeout(t); t = null } }
  return wrapped
}

// Default coalescing window for realtime → refetch. Long enough to absorb a
// multi-row write burst, short enough to still feel "live".
export const REFETCH_DEBOUNCE_MS = 400
