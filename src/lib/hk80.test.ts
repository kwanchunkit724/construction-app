import { describe, it, expect } from 'vitest'
import { wgs84ToHK80 } from './hk80'

describe('wgs84ToHK80', () => {
  it('maps the HK1980 grid origin to (E0, N0)', () => {
    // φ0 = 22°18′43.68″N, λ0 = 114°10′42.80″E
    const lat = 22 + 18 / 60 + 43.68 / 3600
    const lng = 114 + 10 / 60 + 42.80 / 3600
    const g = wgs84ToHK80(lat, lng)
    expect(g.easting).toBeCloseTo(836694.05, 1)
    expect(g.northing).toBeCloseTo(819069.80, 1)
    expect(g.gridRef).toMatch(/^\d+ \d+$/)
  })

  it('produces plausible easting/northing for Tsim Sha Tsui', () => {
    // Rough TST ~ 22.297 / 114.172
    const g = wgs84ToHK80(22.297, 114.172)
    expect(g.easting).toBeGreaterThan(800000)
    expect(g.easting).toBeLessThan(870000)
    expect(g.northing).toBeGreaterThan(800000)
    expect(g.northing).toBeLessThan(850000)
  })
})
