import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'viewer-pdf':       ['react-pdf', 'pdfjs-dist'],
          'viewer-zoom':      ['react-zoom-pan-pinch'],
          'reports-xlsx':     ['xlsx'],
          'reports-pdf':      ['jspdf', 'jspdf-autotable'],
          'charts-recharts':  ['recharts'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    hmr: {
      clientPort: 443,
      protocol: 'wss',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
})
