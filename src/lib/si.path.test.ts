import { describe, it, expect } from 'vitest'
import { validateSiPath } from './si'

describe('validateSiPath', () => {
  it('requires the project UUID prefix', () => {
    expect(validateSiPath('proj-1', 'proj-1/si/x/v1/photos/a.jpg')).toBe(true)
    expect(validateSiPath('proj-1', 'proj-2/si/x/v1/photos/a.jpg')).toBe(false)
  })
})
