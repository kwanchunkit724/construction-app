// Pure helpers for documents-register paths, filename sanitising, numbering
// prefixes, and ZH labels. No Supabase calls. Mirrors src/lib/drawings.ts.
//
// Path scheme (per FILE-SYSTEM-DESIGN §2.1, same as drawings): the storage
// object name is {project_id}/{document_id}/v{version_no}/{filename}. The first
// folder segment MUST be the project_id — the project-docs storage RLS policies
// key off `(storage.foldername(name))[1]::uuid`. DocumentsContext additionally
// asserts startsWith(`${projectId}/`) on upload as defence-in-depth (the same
// T-01-14 mitigation DrawingsContext uses).

import { sanitizeFilename } from './drawings'
import {
  DOCUMENT_TYPE_ZH,
  DOCUMENT_STATUS_ZH,
  type DocumentType,
  type DocumentStatus,
} from '../types'

// Re-export the drawings sanitiser unchanged — the storage object only carries
// the extension for content-type convenience; the display name lives in
// documents.title (identical contract to drawings).
export { sanitizeFilename }

export function docsPathFor(
  projectId: string,
  documentId: string,
  versionNo: number,
  filename: string,
): string {
  return `${projectId}/${documentId}/v${versionNo}/${filename}`
}

export function docsThumbPathFor(
  projectId: string,
  documentId: string,
  versionNo: number,
): string {
  return `${projectId}/${documentId}/v${versionNo}/thumb.jpg`
}

// Document-number prefixes — MUST match next_document_number's CASE in
// supabase/v40-split/4-rpcs.sql (the RPC is the source of truth; this map only
// lets the UI preview / label a type locally).
export const DOC_PREFIX: Record<DocumentType, string> = {
  material_submission: 'MAT',
  method_statement: 'MS',
  drawing: 'DWG',
  inspection: 'INS',
  other: 'DOC',
}

// ZH label helpers (mirrors the revisionLabelOrDefault-style convenience in
// drawings.ts — thin wrappers over the const maps in types.ts so callers don't
// each import both the map and the type).
export function documentTypeLabel(type: DocumentType): string {
  return DOCUMENT_TYPE_ZH[type]
}

export function documentStatusLabel(status: DocumentStatus): string {
  return DOCUMENT_STATUS_ZH[status]
}

// Default revision label — `v{n}` when no explicit 'Rev A' supplied (same shape
// as drawings.ts revisionLabelOrDefault).
export function revisionLabelOrDefault(
  label: string | null | undefined,
  versionNo: number,
): string {
  const trimmed = (label ?? '').trim()
  return trimmed.length > 0 ? trimmed : `v${versionNo}`
}

// Dev-only sanity checks (no test framework configured — same idiom as
// drawings.ts:58). Tree-shaken out of production builds; run once at module
// load under `vite dev`.
if (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.DEV) {
  console.assert(
    docsPathFor('p', 'd', 3, 'x.pdf') === 'p/d/v3/x.pdf',
    'docsPathFor',
  )
  console.assert(
    docsThumbPathFor('p', 'd', 3) === 'p/d/v3/thumb.jpg',
    'docsThumbPathFor',
  )
  console.assert(DOC_PREFIX.material_submission === 'MAT', 'DOC_PREFIX MAT')
  console.assert(DOC_PREFIX.method_statement === 'MS', 'DOC_PREFIX MS')
  console.assert(DOC_PREFIX.drawing === 'DWG', 'DOC_PREFIX DWG')
  console.assert(DOC_PREFIX.inspection === 'INS', 'DOC_PREFIX INS')
  console.assert(DOC_PREFIX.other === 'DOC', 'DOC_PREFIX DOC')
  console.assert(documentTypeLabel('material_submission') === '物料送審', 'documentTypeLabel')
  console.assert(documentStatusLabel('approved') === '已批准', 'documentStatusLabel')
  console.assert(revisionLabelOrDefault('Rev B', 2) === 'Rev B', 'revisionLabelOrDefault non-empty')
  console.assert(revisionLabelOrDefault('', 2) === 'v2', 'revisionLabelOrDefault empty')
  console.assert(revisionLabelOrDefault(null, 5) === 'v5', 'revisionLabelOrDefault null')
  console.assert(revisionLabelOrDefault(undefined, 1) === 'v1', 'revisionLabelOrDefault undefined')
  console.assert(revisionLabelOrDefault('  Rev C  ', 4) === 'Rev C', 'revisionLabelOrDefault trim')
}
