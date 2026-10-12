import '@testing-library/jest-dom/vitest'

// Safety net: any accidental real fetch during unit tests fails loudly.
const originalFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string' ? input :
    input instanceof URL ? input.href :
    input instanceof Request ? input.url : String(input)
  // Allow data: / blob: (some libs); block everything else.
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return originalFetch(input as any, init)
  }
  throw new Error(`[unit-test] Unexpected network fetch blocked: ${url}`)
}) as typeof fetch
