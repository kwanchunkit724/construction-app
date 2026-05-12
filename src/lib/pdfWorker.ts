// src/lib/pdfWorker.ts
// Self-host the PDF.js worker so Capacitor file:// / capacitor://localhost / https://localhost
// origins all resolve the worker as a same-origin asset. CDN workers FAIL on device due to CSP.
//
// DO NOT install pdfjs-dist as a direct dependency — let react-pdf manage the peer version.
// Importing this module is a side-effect that sets GlobalWorkerOptions.workerSrc; import it
// ONCE before any <Page> render (in the viewer module).

import { pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()
