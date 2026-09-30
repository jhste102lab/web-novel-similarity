// Fills the PRECACHE placeholder in dist/sw.js with the hashed asset names of this build, and
// names the cache after them. Runtime caching alone is not enough: a browser may satisfy
// sub-resource requests from its own HTTP cache without ever asking the service worker.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const dist = new URL('../dist/', import.meta.url)
const assets = readdirSync(new URL('assets/', dist))
  // Fonts are fetched on demand and are 3 MB of subsets. Code, styles and the HWP 5 reader's
  // WASM (loaded after every page load, ADR 0006) are what the app needs offline.
  .filter((f) => f.endsWith('.js') || f.endsWith('.css') || f.endsWith('.wasm'))
  .map((f) => `assets/${f}`)

const sw = new URL('sw.js', dist)
const source = readFileSync(sw, 'utf8')
const build = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 8)
const filled = source
  .replace("/*PRECACHE*/ ['']", JSON.stringify(['', ...assets]))
  // A per-build cache name makes activate() drop the previous build instead of keeping both.
  .replace("'web-novel-similarity-v1'", `'web-novel-similarity-${build}'`)
if (filled === source) throw new Error("sw.js has no /*PRECACHE*/ [''] placeholder")
writeFileSync(sw, filled)
console.log(`sw.js precaches ${assets.length + 1} files as web-novel-similarity-${build}`)
