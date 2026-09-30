import type { ManuscriptText } from '../shared/types.ts'

/** A finding's own text with the sentences just before and after it, from the same 회차. */
export interface Around {
  before: string
  text: string
  after: string
}

// Sentence pieces as the engine ends them (., !, ? plus closing quotes, or a line break),
// but keeping short sentences ("응.") that the index skips.
const PIECE = /[^.!?\n]*(?:[.!?]+[”’"'」』)\]]*|\n+|$)/gu
/** Neighbour sentences shown on each side. */
const SENTENCES = 2
/** How far to look for neighbours; a longer neighbour shows only its nearer part. */
const REACH = 500

function pieces(t: string): string[] {
  return (t.match(PIECE) ?? []).map((p) => p.trim()).filter((p) => p !== '')
}

/**
 * Reads the neighbours of the [start, end) offsets a finding carries, in the text the search
 * ran on. Neighbours stop at the chapter segment boundary, found by offset rather than label.
 */
export function aroundOf(m: ManuscriptText): (start: number, end: number) => Around {
  const starts = m.chapters.map((c) => c.start)
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
  return (start, end) => {
    const [from, to] = segment(start)
    return {
      before: pieces(m.text.slice(Math.max(from, start - REACH), start))
        .slice(-SENTENCES)
        .join(' '),
      text: m.text.slice(start, end).trim(),
      after: pieces(m.text.slice(end, Math.min(to, end + REACH)))
        .slice(0, SENTENCES)
        .join(' '),
    }
  }
}
