import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Function form so missing-package entries (react-pdf, react-zoom-pan-pinch
        // arrive in Plan 04) don't break the build today. Rollup's object form
        // throws "Could not resolve entry module" for absent packages.
        manualChunks(id) {
          if (id.includes('node_modules/react-pdf') || id.includes('node_modules/pdfjs-dist')) return 'viewer-pdf'
          if (id.includes('node_modules/react-zoom-pan-pinch')) return 'viewer-zoom'
          if (id.includes('node_modules/xlsx')) return 'reports-xlsx'
          if (id.includes('node_modules/jspdf-autotable')) return 'reports-pdf-autotable'
          if (id.includes('node_modules/jspdf')) return 'reports-pdf'
          if (id.includes('node_modules/recharts')) return 'charts-recharts'
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
