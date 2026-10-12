import { describe, it, expect } from 'vitest'
import { guidedLeaves, guidedPctOf, guidedPct, distinctValues, unionOrdered } from './guided'
import { makeItem } from '../test/fixtures/progress'

describe('guidedLeaves / guidedPct', () => {
  const items = [
    makeItem({
      id: '1', zone_id: 'A', trade_label: '結構', location: '走廊',
      floor_labels: ['1/F', '2/F'], floors_completed: ['1/F'],
    }),
    makeItem({
      id: '2', zone_id: 'B', trade_label: 'BS', location: '機房',
      floor_labels: ['1/F'], floors_completed: ['1/F'],
    }),
    makeItem({
      id: '3', zone_id: 'A', trade_label: '結構', location: '走廊',
      floor_labels: ['1/F', '2/F'], floors_completed: ['1/F', '2/F'],
    }),
  ]

  it('filters by zone / trade / location', () => {
    expect(guidedLeaves(items, { zoneIds: ['A'] })).toHaveLength(2)
    expect(guidedLeaves(items, { tradeLabel: 'BS' })).toHaveLength(1)
    expect(guidedLeaves(items, { location: '走廊', zoneIds: ['A'] })).toHaveLength(2)
  })

  it('computes tick-based % (honest arithmetic, not averaging)', () => {
    const leaves = guidedLeaves(items, { zoneIds: ['A'], tradeLabel: '結構' })
    // two leaves × 2 floors = 4 ticks; completed: 1 + 2 = 3 → 75%
    expect(guidedPctOf(leaves)).toEqual({ pct: 75, done: 3, total: 4 })
  })

  it('scopes to a single floor when requested', () => {
    const r = guidedPct(items, { zoneIds: ['A'], floor: '2/F' })
    // leaf1: 2/F not ticked; leaf3: 2/F ticked → 1/2 = 50%
    expect(r).toEqual({ pct: 50, done: 1, total: 2 })
  })

  it('returns null pct when nothing matches', () => {
    expect(guidedPctOf([])).toEqual({ pct: null, done: 0, total: 0 })
  })
})

describe('distinctValues / unionOrdered', () => {
  const leaves = [
    makeItem({ id: '1', trade_label: '結構', location: '走廊' }),
    makeItem({ id: '2', trade_label: '結構', location: '機房' }),
    makeItem({ id: '3', trade_label: 'BS', location: null }),
  ]

  it('collects distinct non-null dimension values', () => {
    expect(distinctValues(leaves, 'trade_label').sort()).toEqual(['BS', '結構'])
    expect(distinctValues(leaves, 'location').sort()).toEqual(['機房', '走廊'])
  })

  it('unions dict labels with live data labels without dupes', () => {
    expect(unionOrdered(['結構', '泥水'], ['BS', '結構'])).toEqual(['結構', '泥水', 'BS'])
  })
})
