import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isMaterialLate } from './MaterialsContext'
import type { Material } from './MaterialsContext'

function mat(partial: Partial<Material>): Material {
  return {
    id: 'm1',
    project_id: 'p1',
    name: '水管',
    unit: 'm',
    qty_needed: 100,
    qty_arrived: 0,
    item_ids: [],
    requested_by: 'u1',
    planned_arrival_at: null,
    arrived_at: null,
    notes: null,
    urgent: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    status: 'requested',
    ...partial,
  }
}

describe('isMaterialLate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('is late only when status=requested and planned_arrival is past', () => {
    expect(isMaterialLate(mat({
      status: 'requested', planned_arrival_at: '2026-05-01T00:00:00Z',
    }))).toBe(true)
    expect(isMaterialLate(mat({
      status: 'requested', planned_arrival_at: '2026-07-01T00:00:00Z',
    }))).toBe(false)
    expect(isMaterialLate(mat({
      status: 'arrived', planned_arrival_at: '2026-05-01T00:00:00Z',
    }))).toBe(false)
    expect(isMaterialLate(mat({ status: 'requested', planned_arrival_at: null }))).toBe(false)
  })
})
