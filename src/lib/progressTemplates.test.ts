import { describe, it, expect } from 'vitest'
import { templateFor, displayStatusOf } from './progressTemplates'

describe('templateFor', () => {
  it('returns type-specific defaults', () => {
    expect(templateFor('general').defaultMode).toBe('percentage')
    expect(templateFor('general').zoneNoun).toBe('分區/座')
    expect(templateFor('small_works').autoZone).toBe(true)
    expect(templateFor('small_works').zoneNoun).toBeNull()
    expect(templateFor('drainage').defaultMode).toBe('quantity')
    expect(templateFor('maintenance').defaultMode).toBe('unit_status')
  })
  it('falls back to general for null / unknown', () => {
    expect(templateFor(null).type).toBe('general')
    expect(templateFor(undefined).type).toBe('general')
    expect(templateFor('future_type' as any).type).toBe('general')
  })
})

describe('displayStatusOf', () => {
  it('forces blocked when reason set and not completed', () => {
    expect(displayStatusOf({ blocked_reason: '雨天', actual_progress: 40 }, 'in-progress')).toBe('blocked')
  })
  it('keeps completed even with a stale reason', () => {
    expect(displayStatusOf({ blocked_reason: '雨天', actual_progress: 100 }, 'completed')).toBe('completed')
  })
  it('ignores blank reason', () => {
    expect(displayStatusOf({ blocked_reason: '  ', actual_progress: 40 }, 'delayed')).toBe('delayed')
  })
})
