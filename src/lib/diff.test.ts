import { describe, it, expect } from 'vitest'
import { diffText, diffArrayPins } from './diff'

describe('diffText', () => {
  it('marks equal / insert / delete parts', () => {
    const parts = diffText('hello world', 'hello there')
    const types = parts.map(p => p.type)
    expect(types).toContain('equal')
    expect(types).toContain('delete')
    expect(types).toContain('insert')
  })
  it('treats nullish as empty', () => {
    expect(diffText('', 'abc').some(p => p.type === 'insert')).toBe(true)
  })
})

describe('diffArrayPins', () => {
  it('computes added and removed ids', () => {
    expect(diffArrayPins(['a', 'b'], ['b', 'c'])).toEqual({
      added: ['c'],
      removed: ['a'],
    })
  })
  it('handles identical arrays', () => {
    expect(diffArrayPins(['x'], ['x'])).toEqual({ added: [], removed: [] })
  })
})
