let rowA = new Int32Array(256)
let rowB = new Int32Array(256)

/**
 * Levenshtein distance with Ukkonen's band: cells farther than `maxDist` from the
 * diagonal cannot lead to a distance ≤ maxDist, so they are skipped. Returns
 * `maxDist + 1` when the true distance exceeds `maxDist`.
 */
export function boundedEditDistance(a: string, b: string, maxDist: number): number {
  if (a.length < b.length) [a, b] = [b, a]
  const n = a.length
  const m = b.length
  if (n - m > maxDist) return maxDist + 1
  if (m === 0) return n
  if (rowA.length < m + 1) {
    rowA = new Int32Array(m + 1)
    rowB = new Int32Array(m + 1)
  }
  let prev = rowA
  let cur = rowB
  for (let j = 0; j <= m; j++) prev[j] = j
  for (let i = 1; i <= n; i++) {
    const lo = Math.max(1, i - maxDist)
    const hi = Math.min(m, i + maxDist)
    cur[lo - 1] = lo - 1 === 0 ? i : maxDist + 1
    let rowMin = cur[lo - 1]!
    const ca = a.charCodeAt(i - 1)
    for (let j = lo; j <= hi; j++) {
      const sub = prev[j - 1]! + (ca === b.charCodeAt(j - 1) ? 0 : 1)
      const del = prev[j]! + 1
      const ins = cur[j - 1]! + 1
      const v = sub < del ? (sub < ins ? sub : ins) : del < ins ? del : ins
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (hi < m) cur[hi + 1] = maxDist + 1
    if (rowMin > maxDist) return maxDist + 1
    ;[prev, cur] = [cur, prev]
  }
  return Math.min(prev[m]!, maxDist + 1)
}

/** 1 - distance / longer length, floored at `minSimilarity` (returns 0 below it). */
export function similarity(a: string, b: string, minSimilarity: number): number {
  const longer = Math.max(a.length, b.length)
  if (longer === 0) return 1
  const maxDist = Math.floor(longer * (1 - minSimilarity))
  const d = boundedEditDistance(a, b, maxDist)
  return d > maxDist ? 0 : 1 - d / longer
}
