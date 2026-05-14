import DiffMatchPatch from 'diff-match-patch'

export type DiffPart = { type: 'equal' | 'insert' | 'delete'; text: string }

const dmp = new DiffMatchPatch()

export function diffText(oldStr: string, newStr: string): DiffPart[] {
  const raw = dmp.diff_main(oldStr || '', newStr || '')
  dmp.diff_cleanupSemantic(raw)
  return raw.map(([op, text]) => ({
    type: op === 0 ? 'equal' : op === 1 ? 'insert' : 'delete',
    text,
  }))
}

export function diffArrayPins(oldIds: string[], newIds: string[]): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldIds)
  const newSet = new Set(newIds)
  return {
    added: newIds.filter(id => !oldSet.has(id)),
    removed: oldIds.filter(id => !newSet.has(id)),
  }
}
