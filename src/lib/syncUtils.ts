const listeners = new Set<() => void>()

export function triggerRefetch(): void {
  listeners.forEach(fn => fn())
}

export function startPolling(fn: () => void, intervalMs = 5000): () => void {
  fn()
  listeners.add(fn)
  const interval = setInterval(fn, intervalMs)
  const onVisibility = () => { if (document.visibilityState === 'visible') fn() }
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisibility)
    listeners.delete(fn)
  }
}
