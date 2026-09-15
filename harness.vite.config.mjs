// Dev-only vite server for src/renderer/harness.html (browser-based UI testing).
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

export default {
  root: resolve('src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react()],
  server: { port: 5173, strictPort: true }
}
