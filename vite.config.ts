import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the site under /<repo>/; dev and preview use the same path.
export default defineConfig({
  base: '/web-novel-similarity/',
  plugins: [react()],
})
