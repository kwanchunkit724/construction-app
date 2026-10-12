import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isCredentialValid, hasMatchingCredential, credentialTypeLabel, CREDENTIAL_TYPE_ZH } from './credentials'
import type { UserCredential } from '../types'

function cred(partial: Partial<UserCredential>): UserCredential {
  return {
    id: 'c1',
    user_id: 'u1',
    credential_type: 'competent_person',
    cert_name_zh: '合資格人員',
    cert_no: null,
    issuer: null,
    valid_from: null,
    valid_until: null,
    doc_path: null,
    verified_at: '2026-01-01T00:00:00Z',
    verified_by: 'admin',
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  } as UserCredential
}

describe('isCredentialValid', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T04:00:00Z')) // HK afternoon
  })
  afterEach(() => { vi.useRealTimers() })

  it('requires verified_at', () => {
    expect(isCredentialValid(cred({ verified_at: null }))).toBe(false)
  })
  it('treats null valid_until as never-expiring', () => {
    expect(isCredentialValid(cred({ valid_until: null }))).toBe(true)
  })
  it('compares valid_until against Asia/Hong_Kong date', () => {
    expect(isCredentialValid(cred({ valid_until: '2026-06-15' }))).toBe(true)
    expect(isCredentialValid(cred({ valid_until: '2026-06-14' }))).toBe(false)
  })
})

describe('hasMatchingCredential / labels', () => {
  it('matches type + validity', () => {
    const list = [
      cred({ credential_type: 'rpe', verified_at: null }),
      cred({ credential_type: 'competent_person', verified_at: '2026-01-01T00:00:00Z' }),
    ]
    expect(hasMatchingCredential(list, 'competent_person')).toBe(true)
    expect(hasMatchingCredential(list, 'rpe')).toBe(false)
  })
  it('labels known types and falls back to raw', () => {
    expect(credentialTypeLabel('rpe')).toBe(CREDENTIAL_TYPE_ZH.rpe)
    expect(credentialTypeLabel('custom_x')).toBe('custom_x')
  })
})
