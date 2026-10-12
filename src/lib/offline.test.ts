import { describe, it, expect, beforeEach } from 'vitest'
import { cacheSet, cacheGet, cacheClearAll, OFFLINE_WRITE_MSG, getOnline } from './offline'

describe('offline read-cache', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips cached data with a timestamp', () => {
    cacheSet('projects', [{ id: 1 }])
    const hit = cacheGet<{ id: number }[]>('projects')
    expect(hit).not.toBeNull()
    expect(hit!.data).toEqual([{ id: 1 }])
    expect(typeof hit!.ts).toBe('number')
  })

  it('returns null for missing / corrupt entries', () => {
    expect(cacheGet('missing')).toBeNull()
    localStorage.setItem('ckcon-cache-bad', '{not-json')
    expect(cacheGet('bad')).toBeNull()
  })

  it('cacheClearAll removes only ckcon-cache- keys', () => {
    cacheSet('a', 1)
    localStorage.setItem('other', 'keep')
    cacheClearAll()
    expect(cacheGet('a')).toBeNull()
    expect(localStorage.getItem('other')).toBe('keep')
  })
})

describe('offline constants', () => {
  it('exposes the canonical zh-HK write-blocked message', () => {
    expect(OFFLINE_WRITE_MSG).toContain('離線中')
  })
  it('getOnline returns a boolean', () => {
    expect(typeof getOnline()).toBe('boolean')
  })
})
