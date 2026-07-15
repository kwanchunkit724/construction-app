// Pure helpers for drawings paths + revision labels. No Supabase calls.
//
// Path scheme (per D-18): {project_id}/{drawing_id}/v{version_no}/{filename}
// The first folder segment MUST be the project_id — storage RLS policies in
// v8-drawings.sql key off `(storage.foldername(name))[1]::uuid`. The
// DrawingsContext upload path additionally asserts startsWith(`${projectId}/`)
// as defence-in-depth (T-01-14 mitigation).

export function drawingsPathFor(
  projectId: string,
  drawingId: string,
  versionNo: number,
  filename: string,
): string {
  return `${projectId}/${drawingId}/v${versionNo}/${filename}`
}

export function drawingsThumbPathFor(
  projectId: string,
  drawingId: string,
  versionNo: number,
): string {
  return `${projectId}/${drawingId}/v${versionNo}/thumb.jpg`
}

export function revisionLabelOrDefault(
  label: string | null | undefined,
  versionNo: number,
): string {
  const trimmed = (label ?? '').trim()
  return trimmed.length > 0 ? trimmed : `v${versionNo}`
}

// STRICT rejection (ISSUE-02 fix): any path-traversal token or path separator
// → fallback. No recovery, no guessing. This intentionally drops the user's
// original filename — display-name lives in drawings.title; the storage object
// name only carries the extension for content-type sniffing convenience.
export function sanitizeFilename(originalName: string): string {
  if (
    originalName.includes('..') ||
    originalName.includes('/') ||
    originalName.includes('\\')
  ) {
    return 'drawing.bin'
  }
  const lastDot = originalName.lastIndexOf('.')
  if (lastDot < 0) return 'drawing.bin'
  const ext = originalName
    .slice(lastDot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return ext.length > 0 ? `drawing.${ext}` : 'drawing.bin'
}

// Dev-only sanity checks (no test framework configured in this repo per
// CONVENTIONS.md "No automated tests"). These run once at module load on
// `vite dev` and are tree-shaken out of production builds.
if (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.DEV) {
  console.assert(
    drawingsPathFor('p', 'd', 3, 'x.pdf') === 'p/d/v3/x.pdf',
    'drawingsPathFor',
  )
  console.assert(
    drawingsThumbPathFor('p', 'd', 3) === 'p/d/v3/thumb.jpg',
    'drawingsThumbPathFor',
  )
  console.assert(
    revisionLabelOrDefault('Rev B', 2) === 'Rev B',
    'revisionLabelOrDefault non-empty',
  )
  console.assert(
    revisionLabelOrDefault('', 2) === 'v2',
    'revisionLabelOrDefault empty',
  )
  console.assert(
    revisionLabelOrDefault(null, 5) === 'v5',
    'revisionLabelOrDefault null',
  )
  console.assert(
    revisionLabelOrDefault(undefined, 1) === 'v1',
    'revisionLabelOrDefault undefined',
  )
  console.assert(
    revisionLabelOrDefault('  Rev C  ', 4) === 'Rev C',
    'revisionLabelOrDefault trim',
  )
  console.assert(
    sanitizeFilename('../../passwd') === 'drawing.bin',
    'sanitizeFilename traversal -> drawing.bin',
  )
  console.assert(
    sanitizeFilename('../passwd') === 'drawing.bin',
    'sanitizeFilename dotdot -> drawing.bin',
  )
  console.assert(
    sanitizeFilename('foo/bar.pdf') === 'drawing.bin',
    'sanitizeFilename slash -> drawing.bin',
  )
  console.assert(
    sanitizeFilename('site plan.PDF') === 'drawing.pdf',
    'sanitizeFilename normal lowercase ext',
  )
  console.assert(
    sanitizeFilename('weird.PDF') === 'drawing.pdf',
    'sanitizeFilename uppercase ext',
  )
  console.assert(
    sanitizeFilename('noext') === 'drawing.bin',
    'sanitizeFilename noext',
  )
}
