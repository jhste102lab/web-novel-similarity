import { MAX_CANDIDATES_PER_SENTENCE, MIN_SHARED_FINGERPRINTS } from '../shared/constants.ts'
import type { FingerprintIndex } from './fingerprints.ts'

/** Reusable scratch space so candidate lookup allocates nothing per query. */
export class CandidateFinder {
  private readonly target: FingerprintIndex
  private readonly counts: Int32Array
  private readonly touched: Int32Array
  private touchedLen = 0

  constructor(target: FingerprintIndex, targetSentences: number) {
    this.target = target
    this.counts = new Int32Array(targetSentences)
    this.touched = new Int32Array(targetSentences)
  }

  /**
   * Target sentence ids sharing ≥ MIN_SHARED_FINGERPRINTS fingerprints with the query,
   * as an interleaved list [id, sharedCount, id, sharedCount, …], best overlap first,
   * at most MAX_CANDIDATES_PER_SENTENCE ids. `exclude` (self compare) drops ids ≤ that
   * value so each pair is seen once.
   */
  find(query: FingerprintIndex, i: number, exclude = -1): number[] {
    const { fp, fpStart } = query
    const counts = this.counts
    for (let k = fpStart[i]!; k < fpStart[i + 1]!; k++) {
      const list = this.target.postings.get(fp[k]!)
      if (!list) continue
      for (const j of list) {
        if (j <= exclude) continue
        if (counts[j] === 0) this.touched[this.touchedLen++] = j
        counts[j]!++
      }
    }
    const ids: number[] = []
    for (let t = 0; t < this.touchedLen; t++) {
      const j = this.touched[t]!
      if (counts[j]! >= MIN_SHARED_FINGERPRINTS) ids.push(j)
    }
    if (ids.length > MAX_CANDIDATES_PER_SENTENCE) {
      ids.sort((x, y) => counts[y]! - counts[x]!)
      ids.length = MAX_CANDIDATES_PER_SENTENCE
    }
    const out: number[] = []
    for (const j of ids) out.push(j, counts[j]!)
    for (let t = 0; t < this.touchedLen; t++) counts[this.touched[t]!] = 0
    this.touchedLen = 0
    return out
  }
}
