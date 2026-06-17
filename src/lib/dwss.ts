// DWSS-format document identifiers (DEVB TC(W) 2/2023 Annex A §3.1.8): records are
// stamped TYPE/SUBTYPE/<6-digit serial>[/revision], e.g. CM/PMI/000001.
//
// CK already generates per-project serial numbers (next_si_number, next_ptw_number,
// next_document_number, next_equipment_ref EQ-NNN…). Rather than a risky 6-table
// migration + backfill, we DERIVE the DWSS-format reference from the existing
// (docType, serial) at display/export time — so it also covers every EXISTING
// record with zero migration. Map CK doc types onto the closest DWSS field codes;
// a few (drawing/equipment/document) are CK extensions outside the DWSS form list.

type DwssCode = { type: string; sub: string }

const DWSS_PREFIX: Record<string, DwssCode> = {
  si: { type: 'CM', sub: 'PMI' },   // Site Instruction ≈ Project Manager's Instruction
  vo: { type: 'CM', sub: 'CE' },    // Variation Order ≈ Compensation Event
  ptw: { type: 'SSR', sub: 'PTW' }, // Permit to Work (Site Safety Record)
  issue: { type: 'SSR', sub: 'NCR' }, // Issue ≈ Non-Conformity Report
  daily: { type: 'SD', sub: 'XX' },   // Site Diary
  form: { type: 'SSR', sub: 'XX' },   // statutory form instance
  drawing: { type: 'DWG', sub: 'XX' },     // CK extension (not a DWSS form type)
  document: { type: 'DOC', sub: 'XX' },    // CK extension
  equipment: { type: 'PME', sub: 'XX' },   // plant/machinery & equipment (CK extension)
}

// Format a DWSS-style reference from a CK doc type + numeric serial.
// e.g. dwssRef('ptw', 1) -> "SSR/PTW/000001"; dwssRef('si', 12, 'B') -> "CM/PMI/000012/B"
export function dwssRef(docType: string, serial: number | null | undefined, revision?: string | null): string {
  const p = DWSS_PREFIX[docType] ?? { type: 'XX', sub: 'XX' }
  const n = typeof serial === 'number' && serial >= 0 ? serial : 0
  const num = String(n).padStart(6, '0')
  return `${p.type}/${p.sub}/${num}${revision ? '/' + revision : ''}`
}

// True when a CK doc type maps to a real DWSS Annex A form code (vs a CK extension).
export function isDwssStandard(docType: string): boolean {
  const p = DWSS_PREFIX[docType]
  return !!p && !['DWG', 'DOC', 'PME'].includes(p.type)
}
