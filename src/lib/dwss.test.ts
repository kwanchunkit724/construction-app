import { describe, it, expect } from 'vitest'
import { dwssRef, isDwssStandard } from './dwss'

describe('dwssRef', () => {
  it('formats SI / VO / PTW with zero-padded serial', () => {
    expect(dwssRef('si', 1)).toBe('CM/PMI/000001')
    expect(dwssRef('vo', 12)).toBe('CM/CE/000012')
    expect(dwssRef('ptw', 7)).toBe('SSR/PTW/000007')
  })
  it('appends revision when provided', () => {
    expect(dwssRef('si', 12, 'B')).toBe('CM/PMI/000012/B')
  })
  it('falls back for unknown type / null serial', () => {
    expect(dwssRef('unknown', null)).toBe('XX/XX/000000')
    expect(dwssRef('issue', -1)).toBe('SSR/NCR/000000')
  })
})

describe('isDwssStandard', () => {
  it('marks Annex A codes true and CK extensions false', () => {
    expect(isDwssStandard('si')).toBe(true)
    expect(isDwssStandard('ptw')).toBe(true)
    expect(isDwssStandard('drawing')).toBe(false)
    expect(isDwssStandard('document')).toBe(false)
    expect(isDwssStandard('equipment')).toBe(false)
  })
})
