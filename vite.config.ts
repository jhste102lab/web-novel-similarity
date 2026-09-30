import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * The built page may load and fetch only this site's own files: no other origin can be
 * reached, even by a bug or a compromised dependency (ADR 0001). WASM (rhwp) needs
 * 'wasm-unsafe-eval'; the PDF preview is a blob: frame. Dev keeps Vite's inline scripts.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  'frame-src blob:',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const csp: Plugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
}

// GitHub Pages serves the site under /<repo>/; dev and preview use the same path.
export default defineConfig({
  base: '/web-novel-similarity/',
  plugins: [react(), csp],
})
