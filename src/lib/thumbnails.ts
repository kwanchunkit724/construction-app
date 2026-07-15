// Client-side 256x256 JPEG thumbnail generator for drawings.
//
// Inputs supported:
//   * image/jpeg, image/png → createImageBitmap → canvas (object-fit: cover)
//   * application/pdf       → react-pdf's bundled pdfjs → render page 1 to canvas
//
// Returns a JPEG Blob (~10–50 KB) at 256x256 on success, or null on failure.
// Per D-16, callers MUST treat null as a soft failure and fall back to a
// category icon — thumbnail generation is best-effort and never blocks upload.
//
// IMPORTANT: This module imports react-pdf's pdfjs. The worker is configured
// in src/lib/pdfWorker.ts. Callers (e.g., DrawingsContext.uploadDrawing) MUST
// `await import('./pdfWorker')` before invoking generateThumbnail to ensure
// GlobalWorkerOptions.workerSrc is set when the PDF branch runs.

import { pdfjs } from 'react-pdf'

const THUMB_SIZE = 256
const JPEG_QUALITY = 0.8

export async function generateThumbnail(file: File): Promise<Blob | null> {
  try {
    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      return await thumbnailFromImage(file)
    }
    if (file.type === 'application/pdf') {
      return await thumbnailFromPdf(file)
    }
    return null
  } catch (err) {
    console.warn('generateThumbnail failed:', err)
    return null
  }
}

async function thumbnailFromImage(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_SIZE
  canvas.height = THUMB_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return null
  }

  // object-fit: cover — fill the square, crop overflow. Aspect-preserving.
  const scale = Math.max(THUMB_SIZE / bitmap.width, THUMB_SIZE / bitmap.height)
  const drawW = bitmap.width * scale
  const drawH = bitmap.height * scale
  const dx = (THUMB_SIZE - drawW) / 2
  const dy = (THUMB_SIZE - drawH) / 2
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE)
  ctx.drawImage(bitmap, dx, dy, drawW, drawH)
  bitmap.close()

  return await canvasToBlob(canvas)
}

async function thumbnailFromPdf(file: File): Promise<Blob | null> {
  const arrayBuf = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuf) })
  const pdf = await loadingTask.promise
  try {
    const page = await pdf.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    // object-fit: contain (PDFs are documents — letterbox rather than crop)
    const scale = Math.min(
      THUMB_SIZE / baseViewport.width,
      THUMB_SIZE / baseViewport.height,
    )
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = THUMB_SIZE
    canvas.height = THUMB_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE)

    // Centre the rendered page inside the 256x256 square
    const offX = (THUMB_SIZE - viewport.width) / 2
    const offY = (THUMB_SIZE - viewport.height) / 2
    ctx.translate(offX, offY)

    // pdfjs render() requires either `canvas` or `canvasContext` depending on
    // version; pdfjs ≥ 4 expects `canvas`. Cast keeps this future-proof.
    const renderTask = page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    } as Parameters<typeof page.render>[0])
    await renderTask.promise

    return await canvasToBlob(canvas)
  } finally {
    await pdf.destroy().catch(() => {})
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY)
  })
}
