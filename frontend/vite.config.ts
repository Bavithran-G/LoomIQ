import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const api = process.env.LOOMIQ_API ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173, proxy: { '/api': api } },
  preview: { port: 4173, proxy: { '/api': api } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
} as never)
