import { MAX_POSTINGS, NGRAM, WINDOW } from '../shared/constants.ts'

/**
 * Winnowing (Schleimer, Wilkerson, Aiken 2003): hash every character n-gram with a
 * polynomial rolling hash (Rabin–Karp), then keep the minimum hash of every window of
 * WINDOW consecutive hashes. Guarantees any shared substring of length
 * NGRAM + WINDOW - 1 yields at least one shared fingerprint.
 */
function winnow(norm: string): number[] {
  const n = norm.length
  if (n < NGRAM) return n === 0 ? [] : [hashRange(norm, 0, n)]
  const hashes = new Uint32Array(n - NGRAM + 1)
  let h = 0
  for (let i = 0; i < NGRAM; i++) h = (Math.imul(h, BASE) + norm.charCodeAt(i)) >>> 0
  hashes[0] = h
  for (let i = NGRAM; i < n; i++) {
    h =
      (Math.imul(h - Math.imul(norm.charCodeAt(i - NGRAM), BASE_POW), BASE) +
        norm.charCodeAt(i)) >>>
      0
    hashes[i - NGRAM + 1] = h
  }
  const out: number[] = []
  let lastPicked = -1
  const windows = Math.max(1, hashes.length - WINDOW + 1)
  for (let w = 0; w < windows; w++) {
    let min = w
    const end = Math.min(w + WINDOW, hashes.length)
    for (let j = w + 1; j < end; j++) if (hashes[j]! <= hashes[min]!) min = j
    if (min !== lastPicked) {
      out.push(hashes[min]!)
      lastPicked = min
    }
  }
  return out
}

const BASE = 0x01000193
const BASE_POW = powMod(BASE, NGRAM - 1)

function powMod(base: number, exp: number): number {
  let r = 1
  for (let i = 0; i < exp; i++) r = Math.imul(r, base) >>> 0
  return r
}

function hashRange(s: string, from: number, to: number): number {
  let h = 0
  for (let i = from; i < to; i++) h = (Math.imul(h, BASE) + s.charCodeAt(i)) >>> 0
  return h
}

/** Fingerprints of every sentence, flattened, plus the inverted index fingerprint → sentence ids. */
export interface FingerprintIndex {
  /** fp[fpStart[i] .. fpStart[i+1]) are the fingerprints of sentence i. */
  fp: Uint32Array
  fpStart: Uint32Array
  postings: Map<number, number[]>
}

/** `include` marks sentences that take part (range filter); excluded sentences get no fingerprints. */
export function buildFingerprintIndex(norm: string[], include: Uint8Array): FingerprintIndex {
  const perSentence: number[][] = new Array(norm.length)
  let total = 0
  for (let i = 0; i < norm.length; i++) {
    const f = include[i] ? winnow(norm[i]!) : []
    perSentence[i] = f
    total += f.length
  }
  const fp = new Uint32Array(total)
  const fpStart = new Uint32Array(norm.length + 1)
  const postings = new Map<number, number[]>()
  let k = 0
  for (let i = 0; i < norm.length; i++) {
    fpStart[i] = k
    const seen = new Set<number>()
    for (const h of perSentence[i]!) {
      fp[k++] = h
      if (seen.has(h)) continue
      seen.add(h)
      const list = postings.get(h)
      if (list) list.push(i)
      else postings.set(h, [i])
    }
  }
  fpStart[norm.length] = k
  for (const [h, list] of postings) if (list.length > MAX_POSTINGS) postings.delete(h)
  return { fp, fpStart, postings }
}
