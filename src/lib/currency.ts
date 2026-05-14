// Integer-cent HKD utilities. Never use parseFloat on currency values for
// arithmetic — convert via parseHKD → integer cents → multiplyCents, then
// format via formatHKD only at display boundaries (P7 in 02-RESEARCH §9).

const fmt = new Intl.NumberFormat('en-HK', {
  style: 'currency',
  currency: 'HKD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatHKD(cents: number | bigint): string {
  const n = typeof cents === 'bigint' ? Number(cents) : cents
  if (!Number.isFinite(n)) return 'HK$0.00'
  return fmt.format(n / 100)
}

export function parseHKD(s: string): number {
  const cleaned = (s || '').replace(/[^0-9.]/g, '')
  if (!cleaned) return 0
  const f = parseFloat(cleaned)
  if (!Number.isFinite(f)) return 0
  return Math.round(f * 100)
}

export function multiplyCents(quantity: number, unitPriceCents: number): number {
  // Defensive: round at final step only.
  return Math.round(quantity * unitPriceCents)
}
