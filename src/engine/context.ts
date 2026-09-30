import type { ManuscriptText } from '../shared/types.ts'

/**
 * A finding's own text with the sentences just before and after it, from the same 회차.
 * `before` ends and `after` starts with the text's own separator (a space or line breaks), so
 * `before + text + after` reads as the manuscript does.
 */
export interface Around {
  before: string
  text: string
  after: string
}

// Sentence pieces as the engine ends them (., !, ? plus closing quotes, or a line break),
// but keeping short sentences ("응.") that the index skips.
const PIECE = /[^.!?\n]*(?:[.!?]+[”’"'」』)\]]*|\n+|$)/gu
/** Neighbour sentences shown on each side. */
const SENTENCES = 4
/** How far to look for neighbours; a longer neighbour shows only its nearer part. */
const REACH = 1000

/** Offsets in `t` where its non-blank sentence pieces start and end. */
function pieces(t: string): [number, number][] {
  const out: [number, number][] = []
  for (const m of t.matchAll(PIECE)) {
    if (m[0].trim() !== '') out.push([m.index, m.index + m[0].length])
  }
  return out
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
    const pre = m.text.slice(Math.max(from, start - REACH), start)
    const post = m.text.slice(end, Math.min(to, end + REACH))
    const p = pieces(pre)
    const q = pieces(post)
    const before = p.length > 0 ? pre.slice(p[Math.max(0, p.length - SENTENCES)]![0]) : ''
    const after = q.length > 0 ? post.slice(0, q[Math.min(q.length, SENTENCES) - 1]![1]) : ''
    return {
      before: paragraphs(before.trimStart()),
      text: m.text.slice(start, end).trim(),
      after: paragraphs(after.trimEnd()),
    }
  }
}

/** Keeps line breaks but at most one blank line between paragraphs. */
function paragraphs(t: string): string {
  return t.replace(/\n\s*\n\s*/gu, '\n\n')
}
