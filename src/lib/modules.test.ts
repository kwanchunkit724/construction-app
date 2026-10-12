import { describe, it, expect } from 'vitest'
import { MODULES, MODULE_LABELS_ZH, type ModuleKey } from './modules'

describe('MODULES catalogue', () => {
  it('has exactly 13 modules with progress as the sole core', () => {
    expect(MODULES).toHaveLength(13)
    const cores = MODULES.filter(m => m.core)
    expect(cores).toHaveLength(1)
    expect(cores[0].key).toBe('progress')
    expect(cores[0].labelZh).toBe('進度')
  })

  it('keeps MODULE_LABELS_ZH in sync with MODULES', () => {
    for (const m of MODULES) {
      expect(MODULE_LABELS_ZH[m.key]).toBe(m.labelZh)
    }
    expect(Object.keys(MODULE_LABELS_ZH)).toHaveLength(13)
  })

  it('assigns either a route or a tabId to every module', () => {
    for (const m of MODULES) {
      expect(!!m.route || !!m.tabId).toBe(true)
    }
  })

  it('lists expected keys in canonical order', () => {
    const keys = MODULES.map(m => m.key) as ModuleKey[]
    expect(keys[0]).toBe('progress')
    expect(keys).toContain('si')
    expect(keys).toContain('vo')
    expect(keys).toContain('ptw')
    expect(keys).toContain('equipment')
  })
})
