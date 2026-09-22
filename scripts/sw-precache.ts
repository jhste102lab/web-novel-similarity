// Fills the PRECACHE placeholder in dist/sw.js with the hashed asset names of this build.
// Runtime caching alone is not enough: a browser may satisfy sub-resource requests from its own
// HTTP cache without ever asking the service worker, leaving the app unusable offline.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const dist = new URL('../dist/', import.meta.url)
const assets = readdirSync(new URL('assets/', dist))
  // Fonts are fetched on demand and are 3 MB of subsets; code and styles are what the app needs.
  .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
  .map((f) => `assets/${f}`)

const sw = new URL('sw.js', dist)
const source = readFileSync(sw, 'utf8')
const filled = source.replace("/*PRECACHE*/ ['']", JSON.stringify(['', ...assets]))
if (filled === source) throw new Error("sw.js has no /*PRECACHE*/ [''] placeholder")
writeFileSync(sw, filled)
console.log(`sw.js precaches ${assets.length + 1} files`)
