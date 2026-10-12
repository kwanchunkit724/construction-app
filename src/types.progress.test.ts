import { describe, it, expect } from 'vitest'
import {
  floorsToProgress,
  qtyToProgress,
  unitStatusToProgress,
  unitStatusCounts,
  nextUnitState,
  plannedProgressOf,
  scheduleVariance,
  isScheduled,
  deriveStatus,
  pendingAcceptance,
  acceptanceGate,
  deriveLeafStatus,
  isLeaf,
  getDescendantLeaves,
  getZoneLeaves,
  computeRollup,
  generateFloorLabels,
  formatIssueNo,
  getInitialHandler,
  getNextHandler,
  deriveHandoffAction,
  deriveFormStatus,
  UNIT_STATE_ORDER,
} from './types'
import { makeItem } from './test/fixtures/progress'

describe('floorsToProgress', () => {
  it('computes percentage from completed floors', () => {
    expect(floorsToProgress(['1/F', '2/F'], ['1/F', '2/F', '3/F', '4/F'])).toBe(50)
  })
  it('returns 0 when no labels', () => {
    expect(floorsToProgress([], [])).toBe(0)
  })
})

describe('qtyToProgress', () => {
  it('rounds done/total and clamps 0–100', () => {
    expect(qtyToProgress(230, 600)).toBe(38)
    expect(qtyToProgress(700, 600)).toBe(100)
    expect(qtyToProgress(-10, 100)).toBe(0)
  })
  it('returns 0 when total missing or non-positive', () => {
    expect(qtyToProgress(10, null)).toBe(0)
    expect(qtyToProgress(10, 0)).toBe(0)
  })
})

describe('unitStatusToProgress / unitStatusCounts', () => {
  const labels = ['A', 'B', 'C', 'D']
  const map = { A: 'signed_off', B: 'fixed', C: 'fixing' } as const

  it('counts only signed_off toward %', () => {
    expect(unitStatusToProgress(map as any, labels)).toBe(25)
  })
  it('counts signedOff / fixed / total', () => {
    expect(unitStatusCounts(map as any, labels)).toEqual({
      signedOff: 1, fixed: 1, total: 4,
    })
  })
  it('returns 0 for empty labels', () => {
    expect(unitStatusToProgress({}, [])).toBe(0)
  })
})

describe('nextUnitState', () => {
  it('cycles through UNIT_STATE_ORDER', () => {
    expect(nextUnitState('pending')).toBe('fixing')
    expect(nextUnitState('signed_off')).toBe('pending')
  })
  it('maps unknown values to fixing (never silent rewind)', () => {
    expect(nextUnitState('unprocessed')).toBe('fixing')
    expect(UNIT_STATE_ORDER).toHaveLength(5)
  })
})

describe('plannedProgressOf / scheduleVariance', () => {
  // start Day1=2026-01-01, end Day15=2026-01-15 → 15-day inclusive span
  const item = { planned_start: '2026-01-01', planned_end: '2026-01-15' }

  it('is 0 before start and 100 on/after end', () => {
    expect(plannedProgressOf(item, new Date(2025, 11, 31))).toBe(0)
    expect(plannedProgressOf(item, new Date(2026, 0, 15))).toBe(100)
    expect(plannedProgressOf(item, new Date(2026, 0, 20))).toBe(100)
  })
  it('is linear mid-span (day 3 of 15 → 20%)', () => {
    expect(plannedProgressOf(item, new Date(2026, 0, 3))).toBe(20)
  })
  it('returns 0 when dates missing', () => {
    expect(plannedProgressOf({ planned_start: null, planned_end: null })).toBe(0)
    expect(isScheduled({ planned_start: null, planned_end: '2026-01-01' })).toBe(false)
  })
  it('computes variance as actual − planned', () => {
    expect(scheduleVariance(item, 40, new Date(2026, 0, 3))).toBe(20) // 40-20
  })
})

describe('deriveStatus / acceptanceGate', () => {
  it('derives completed / delayed / in-progress / not-started', () => {
    expect(deriveStatus(100, 50)).toBe('completed')
    expect(deriveStatus(0, 0)).toBe('not-started')
    expect(deriveStatus(0, 40)).toBe('not-started')
    expect(deriveStatus(40, 60)).toBe('delayed') // 40 < 55
    expect(deriveStatus(50, 50)).toBe('in-progress')
  })
  it('withholds completed while acceptance pending', () => {
    const pending = { acceptance_required: true, accepted_at: null }
    expect(pendingAcceptance(pending)).toBe(true)
    expect(acceptanceGate('completed', pending)).toBe('in-progress')
    expect(acceptanceGate('completed', { acceptance_required: true, accepted_at: '2026-01-01' })).toBe('completed')
  })
  it('deriveLeafStatus applies the gate', () => {
    const leaf = makeItem({
      id: '1', actual_progress: 100,
      acceptance_required: true, accepted_at: null,
    })
    expect(deriveLeafStatus(leaf, 100)).toBe('in-progress')
  })
})

describe('tree helpers + computeRollup', () => {
  const parent = makeItem({ id: 'p', title: 'Parent', parent_id: null, zone_id: 'A' })
  const leaf1 = makeItem({
    id: 'l1', parent_id: 'p', zone_id: 'A', actual_progress: 50,
    planned_start: '2026-01-01', planned_end: '2026-01-31',
  })
  const leaf2 = makeItem({
    id: 'l2', parent_id: 'p', zone_id: 'A', actual_progress: 100,
    planned_start: '2026-01-01', planned_end: '2026-01-31',
  })
  const all = [parent, leaf1, leaf2]

  it('identifies leaves and descendants', () => {
    expect(isLeaf(parent, all)).toBe(false)
    expect(isLeaf(leaf1, all)).toBe(true)
    expect(getDescendantLeaves(all, 'p').map(i => i.id).sort()).toEqual(['l1', 'l2'])
    expect(getZoneLeaves(all, 'A').map(i => i.id).sort()).toEqual(['l1', 'l2'])
  })

  it('averages equal-weight leaves', () => {
    const r = computeRollup([leaf1, leaf2], new Date(2026, 0, 16), { plainMean: true })
    expect(r.actual).toBe(75)
    expect(r.leafCount).toBe(2)
    expect(r.qtySum).toBeNull()
  })

  it('quantity-weights homogeneous 渠務 leaves', () => {
    const a = makeItem({
      id: 'q1', tracking_mode: 'quantity', qty_total: 100, qty_done: 50,
      qty_unit: 'm', actual_progress: 50,
    })
    const b = makeItem({
      id: 'q2', tracking_mode: 'quantity', qty_total: 300, qty_done: 300,
      qty_unit: 'm', actual_progress: 100,
    })
    const r = computeRollup([a, b])
    // (50*100 + 100*300) / 400 = 87.5 → 88
    expect(r.actual).toBe(88)
    expect(r.qtySum).toBe(350)
    expect(r.qtyTotal).toBe(400)
    expect(r.qtyUnit).toBe('m')
  })

  it('surfaces blocked when a leaf is blocked and branch incomplete', () => {
    const blocked = makeItem({
      id: 'b', actual_progress: 40, status: 'blocked', blocked_reason: '雨天',
    })
    const ok = makeItem({ id: 'ok', actual_progress: 40 })
    expect(computeRollup([blocked, ok]).status).toBe('blocked')
  })

  it('returns not-started for empty leaf set', () => {
    expect(computeRollup([]).status).toBe('not-started')
  })
})

describe('generateFloorLabels', () => {
  it('orders basements → irregular → standard → roof', () => {
    const labels = generateFloorLabels({
      basements: 2, irregular: ['G/F'], standardCount: 3, roofCount: 2,
    }).map(x => x.label)
    expect(labels).toEqual(['B2', 'B1', 'G/F', '1/F', '2/F', '3/F', 'R/F', 'R2/F'])
  })
})

describe('formatIssueNo', () => {
  it('zero-pads to 3 digits; — for null', () => {
    expect(formatIssueNo(7)).toBe('#007')
    expect(formatIssueNo(null)).toBe('—')
  })
})

describe('issue escalation helpers', () => {
  it('routes initial handler by reporter role', () => {
    expect(getInitialHandler('subcontractor_worker')).toBe('subcontractor')
    expect(getInitialHandler('subcontractor')).toBe('main_contractor')
    expect(getInitialHandler('main_contractor')).toBe('pm')
    expect(getInitialHandler('safety_officer')).toBe('pm')
    expect(getInitialHandler('general_foreman')).toBe('pm')
  })
  it('escalates subcontractor → main_contractor → pm → null', () => {
    expect(getNextHandler('subcontractor')).toBe('main_contractor')
    expect(getNextHandler('main_contractor')).toBe('pm')
    expect(getNextHandler('pm')).toBeNull()
  })
  it('derives handoff action from tier delta', () => {
    expect(deriveHandoffAction('subcontractor', 'pm')).toBe('escalated')
    expect(deriveHandoffAction('pm', 'subcontractor')).toBe('bounced')
    expect(deriveHandoffAction('pm', 'pm')).toBe('reassigned')
  })
})

describe('deriveFormStatus', () => {
  const day = 86400000
  const now = Date.now()

  it('classifies suspended / missing / expired / expiring / valid', () => {
    expect(deriveFormStatus({ valid_until: '2099-01-01', suspended: true }, 30)).toBe('suspended')
    expect(deriveFormStatus({ valid_until: null, suspended: false }, 30)).toBe('missing')
    expect(deriveFormStatus({
      valid_until: new Date(now - day).toISOString(), suspended: false,
    }, 30)).toBe('expired')
    expect(deriveFormStatus({
      valid_until: new Date(now + 5 * day).toISOString(), suspended: false,
    }, 30)).toBe('expiring')
    expect(deriveFormStatus({
      valid_until: new Date(now + 60 * day).toISOString(), suspended: false,
    }, 30)).toBe('valid')
  })
})
