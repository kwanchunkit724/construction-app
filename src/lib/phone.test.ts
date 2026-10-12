import { describe, it, expect } from 'vitest'
import { normalizePhone, phoneToEmail, emailToPhone, isValidHKPhone } from './phone'

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('+852 9123-4567')).toBe('85291234567')
    expect(normalizePhone('9123 4567')).toBe('91234567')
  })
  it('returns empty for empty input', () => {
    expect(normalizePhone('')).toBe('')
  })
})

describe('phoneToEmail / emailToPhone', () => {
  it('round-trips a local 8-digit number', () => {
    const email = phoneToEmail('9123-4567')
    expect(email).toBe('91234567@phone.local')
    expect(emailToPhone(email)).toBe('91234567')
  })
  it('returns null for non-synthetic emails', () => {
    expect(emailToPhone('user@gmail.com')).toBeNull()
  })
})

describe('isValidHKPhone', () => {
  it('accepts 8-digit mobiles starting 5/6/7/9', () => {
    expect(isValidHKPhone('51234567')).toBe(true)
    expect(isValidHKPhone('6123 4567')).toBe(true)
    expect(isValidHKPhone('71234567')).toBe(true)
    expect(isValidHKPhone('91234567')).toBe(true)
  })
  it('rejects landlines, short, and wrong prefix', () => {
    expect(isValidHKPhone('21234567')).toBe(false) // landline
    expect(isValidHKPhone('81234567')).toBe(false)
    expect(isValidHKPhone('1234567')).toBe(false)
    expect(isValidHKPhone('912345678')).toBe(false)
  })
})
