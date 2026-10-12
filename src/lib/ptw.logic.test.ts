import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checklistTemplate,
  isPtwExpired,
  effectivePtwStatus,
  canSubmitPtw,
  canCloseOutPtw,
  hotWorkFireWatchEligible,
  remainingFireWatchSeconds,
  validatePtwPath,
} from './ptw'
import type { PTW } from '../types'

function makePtw(partial: Partial<PTW>): PTW {
  return {
    id: 'ptw-1',
    project_id: 'proj-1',
    number: 'PTW-001',
    ptw_type: 'hot_work',
    current_version_id: null,
    chain_snapshot: null,
    current_step: 0,
    status: 'draft',
    created_by: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    submitted_at: null,
    activated_at: null,
    expires_at: null,
    fire_watch_started_at: null,
    closed_out_at: null,
    locked_at: null,
    ...partial,
  }
}

describe('checklistTemplate', () => {
  it('returns required items for each v1 PTW type', () => {
    const types = [
      'hot_work', 'work_at_height', 'lifting', 'confined_space',
      'excavation', 'electrical', 'scaffold', 'lift',
    ] as const
    for (const t of types) {
      const items = checklistTemplate(t)
      expect(items.length).toBeGreaterThan(0)
      expect(items.some(i => i.required)).toBe(true)
      expect(items.every(i => i.value === null)).toBe(true)
    }
  })
  it('returns empty for unknown type', () => {
    expect(checklistTemplate('other' as any)).toEqual([])
  })
})

describe('PTW status / expiry helpers', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-01T12:00:00Z')) })
  afterEach(() => { vi.useRealTimers() })

  it('derives expired only for active past expires_at', () => {
    const activePast = makePtw({ status: 'active', expires_at: '2026-05-01T00:00:00Z' })
    const activeFuture = makePtw({ status: 'active', expires_at: '2026-07-01T00:00:00Z' })
    const draftPast = makePtw({ status: 'draft', expires_at: '2026-05-01T00:00:00Z' })
    expect(isPtwExpired(activePast)).toBe(true)
    expect(effectivePtwStatus(activePast)).toBe('expired')
    expect(isPtwExpired(activeFuture)).toBe(false)
    expect(isPtwExpired(draftPast)).toBe(false)
  })

  it('canSubmit / canCloseOut gates', () => {
    expect(canSubmitPtw(makePtw({ status: 'draft' }))).toBe(true)
    expect(canSubmitPtw(makePtw({ status: 'revision_requested' }))).toBe(true)
    expect(canSubmitPtw(makePtw({ status: 'active' }))).toBe(false)
    expect(canCloseOutPtw(makePtw({ status: 'active' }))).toBe(true)
    expect(canCloseOutPtw(makePtw({ status: 'draft' }))).toBe(false)
  })

  it('hot-work fire-watch requires 30 minutes', () => {
    const justStarted = makePtw({
      ptw_type: 'hot_work',
      fire_watch_started_at: '2026-06-01T11:45:00Z', // 15 min ago
    })
    const done = makePtw({
      ptw_type: 'hot_work',
      fire_watch_started_at: '2026-06-01T11:00:00Z', // 60 min ago
    })
    expect(hotWorkFireWatchEligible(justStarted)).toBe(false)
    expect(remainingFireWatchSeconds(justStarted)).toBe(15 * 60)
    expect(hotWorkFireWatchEligible(done)).toBe(true)
    expect(remainingFireWatchSeconds(done)).toBe(0)
    expect(hotWorkFireWatchEligible(makePtw({ ptw_type: 'lifting' }))).toBe(true)
  })
})

describe('validatePtwPath', () => {
  it('requires projectId/ptw/ prefix', () => {
    expect(validatePtwPath('proj-1', 'proj-1/ptw/x/v1/ppe/a.jpg')).toBe(true)
    expect(validatePtwPath('proj-1', 'proj-2/ptw/x/v1/ppe/a.jpg')).toBe(false)
    expect(validatePtwPath('proj-1', 'proj-1/si/x/v1/photos/a.jpg')).toBe(false)
  })
})
