import { COMMON_MAX_CHARS, COMMON_MIN_CHAPTERS } from '../shared/constants.ts'
import type { ChapterRange } from '../shared/types.ts'
import type { SentenceIndex } from './sentences.ts'

/**
 * 흔한 표현: normalised sentences of at most COMMON_MAX_CHARS characters that occur in
 * at least COMMON_MIN_CHAPTERS distinct chapters across the given manuscripts.
 */
export function commonPhrases(indexes: SentenceIndex[]): Set<string> {
  const chaptersByNorm = new Map<string, Set<number>>()
  for (let m = 0; m < indexes.length; m++) {
    const idx = indexes[m]!
    for (let i = 0; i < idx.norm.length; i++) {
      const n = idx.norm[i]!
      if (n.length > COMMON_MAX_CHARS) continue
      // Chapters of different manuscripts are distinct even when numbered alike.
      const key = m * 1_000_000 + (idx.chapter[i]! < 0 ? i : idx.chapter[i]!)
      const set = chaptersByNorm.get(n)
      if (set) set.add(key)
      else chaptersByNorm.set(n, new Set([key]))
    }
  }
  const out = new Set<string>()
  for (const [n, set] of chaptersByNorm) if (set.size >= COMMON_MIN_CHAPTERS) out.add(n)
  return out
}

/** 1 for sentences whose chapter lies inside `range` (or all sentences when no range). */
export function inRange(idx: SentenceIndex, range: ChapterRange | undefined): Uint8Array {
  const out = new Uint8Array(idx.norm.length)
  if (!range) return out.fill(1)
  const [lo, hi] = range
  for (let i = 0; i < out.length; i++) {
    const c = idx.chapter[i]!
    out[i] = c >= lo && c <= hi ? 1 : 0
  }
  return out
}
