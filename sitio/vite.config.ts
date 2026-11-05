import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5320, strictPort: true },
  // One entry per language; both load the same app, which reads <html lang>
  build: { rollupOptions: { input: { es: 'index.html', en: 'en/index.html' } } },
})
