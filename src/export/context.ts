import { indexSentences } from '../engine/sentences.ts'
import type { ManuscriptText, Occurrence } from '../shared/types.ts'

/** A repeated sentence where it occurs, with the sentences around it in the same 회차. */
export interface Context {
  before: string
  text: string
  after: string
}

// Sentence pieces as the engine ends them (., !, ? plus closing quotes, or a line break),
// but keeping short sentences ("응.") that the index skips.
const PIECE = /[^.!?\n]*(?:[.!?]+[”’"'」』)\]]*|\n+|$)/gu
/** How far to look for a neighbour; a longer neighbour shows only its nearer part. */
const REACH = 400

function pieces(t: string): string[] {
  return (t.match(PIECE) ?? []).map((p) => p.trim()).filter((p) => p !== '')
}

/**
 * Looks occurrences up in the text the repeat search ran on: the same text indexes to the
 * same sentence ids. Neighbours stop at the 회차 (chapter segment) boundary.
 */
export function contextOf(m: ManuscriptText): (o: Occurrence) => Context {
  const idx = indexSentences(m.text, m.chapters)
  const starts = m.chapters.map((c) => c.start)
  /** [start, end) of the chapter segment holding `pos`, by offset rather than label. */
  const segment = (pos: number): [number, number] => {
    let lo = 0
    let hi = starts.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (starts[mid]! <= pos) lo = mid + 1
      else hi = mid
    }
    return [lo > 0 ? starts[lo - 1]! : 0, lo < starts.length ? starts[lo]! : m.text.length]
  }
  return (o) => {
    const s = idx.starts[o.id]!
    const e = idx.ends[o.id]!
    const [from, to] = segment(s)
    return {
      before: pieces(m.text.slice(Math.max(from, s - REACH), s)).at(-1) ?? '',
      text: m.text.slice(s, e).trim(),
      after: pieces(m.text.slice(e, Math.min(to, e + REACH)))[0] ?? '',
    }
  }
}
