import { describe, it, expect } from 'vitest'
import { formatHKD, parseHKD, multiplyCents } from './currency'

describe('parseHKD', () => {
  it('parses dollars to integer cents', () => {
    expect(parseHKD('12.34')).toBe(1234)
    expect(parseHKD('HK$1,234.56')).toBe(123456)
    expect(parseHKD('0.1')).toBe(10)
  })
  it('returns 0 for empty / garbage', () => {
    expect(parseHKD('')).toBe(0)
    expect(parseHKD('abc')).toBe(0)
  })
  // Known FP quirk: parseFloat('1.005') * 100 === 100.4999… → Math.round → 100
  // (not 101). Callers should prefer whole-cent inputs; document, don't "fix".
  it('documents IEEE-754 half-cent edge (1.005 → 100¢, not 101)', () => {
    expect(parseHKD('1.005')).toBe(100)
  })
})

describe('formatHKD', () => {
  it('formats cents as HKD currency string', () => {
    expect(formatHKD(1234)).toBe('HK$12.34')
    expect(formatHKD(123456)).toMatch(/1,234\.56/)
    expect(formatHKD(0)).toMatch(/0\.00/)
  })
  it('handles NaN / Infinity as HK$0.00', () => {
    expect(formatHKD(Number.NaN)).toBe('HK$0.00')
    expect(formatHKD(Number.POSITIVE_INFINITY)).toBe('HK$0.00')
  })
  it('accepts bigint cents', () => {
    expect(formatHKD(50n)).toMatch(/0\.50/)
  })
})

describe('multiplyCents', () => {
  it('multiplies quantity × unit-price cents and rounds once', () => {
    expect(multiplyCents(3, 1250)).toBe(3750)
    expect(multiplyCents(2.5, 100)).toBe(250)
  })
})
