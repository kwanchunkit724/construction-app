/**
 * Starts polling a fetch function every intervalMs milliseconds.
 * Also re-fetches immediately when the browser tab becomes visible again.
 * Returns a cleanup function to stop polling.
 */
export function startPolling(fn: () => void, intervalMs = 15000): () => void {
  fn()
  const interval = setInterval(fn, intervalMs)
  const onVisibility = () => { if (document.visibilityState === 'visible') fn() }
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
