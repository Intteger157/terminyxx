import {defineConfig} from 'vite'
import type {Plugin} from 'vite'
import react from '@vitejs/plugin-react'

// Production builds also carry the CSP as a <meta> tag (the Go asset server
// sends it as a header too, see csp.go). Not in dev: Vite's HMR needs inline
// scripts. frame-ancestors is header-only, so it isn't repeated here.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: ws://127.0.0.1:*",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function csp(): Plugin {
  return {
    name: 'terminyxx-csp',
    apply: 'build',
    transformIndexHtml: () => [{tag: 'meta', attrs: {'http-equiv': 'Content-Security-Policy', content: CSP}, injectTo: 'head-prepend'}],
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), csp()]
})
