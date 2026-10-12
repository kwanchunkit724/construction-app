import { describe, it, expect } from 'vitest'
import { PUBLIC_WEB_BASE, ptwPublicUrl, equipmentPublicUrl } from './publicVerify'

describe('public QR URL builders', () => {
  it('uses the fixed production web base (not capacitor://)', () => {
    expect(PUBLIC_WEB_BASE).toBe('https://construction-app-lime-six.vercel.app')
    expect(ptwPublicUrl('tok123')).toBe(`${PUBLIC_WEB_BASE}/#/p/tok123`)
    expect(equipmentPublicUrl('eqtok')).toBe(`${PUBLIC_WEB_BASE}/#/pe/eqtok`)
  })
})
