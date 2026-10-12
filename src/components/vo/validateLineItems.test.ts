import { describe, it, expect } from 'vitest'
import { validateLineItems } from './VoLineItemsEditor'
import type { VoLineItem } from '../../types'

function li(partial: Partial<VoLineItem> = {}): VoLineItem {
  return {
    category: 'material',
    description: '混凝土',
    quantity: 10,
    unit: 'm3',
    unit_price_cents: 50000,
    subtotal_cents: 500000,
    progress_leaf_item_id: null,
    ...partial,
  }
}

describe('validateLineItems', () => {
  it('requires at least one item', () => {
    expect(validateLineItems([])).toBe('至少新增一個項目')
  })
  it('validates description / qty / unit / price', () => {
    expect(validateLineItems([li({ description: '  ' })])).toMatch(/缺少描述/)
    expect(validateLineItems([li({ quantity: 0 })])).toMatch(/數量必須大於 0/)
    expect(validateLineItems([li({ unit: '' })])).toMatch(/缺少單位/)
    expect(validateLineItems([li({ unit_price_cents: 0 })])).toMatch(/單價必須大於 0/)
  })
  it('returns null for a valid set', () => {
    expect(validateLineItems([li(), li({ description: '鋼筋' })])).toBeNull()
  })
})
