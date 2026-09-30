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

/** [from, to) of a finding's text with its neighbours, inside its chapter segment. */
function boundsOf(m: ManuscriptText): (start: number, end: number) => [number, number] {
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
    const preFrom = Math.max(from, start - REACH)
    const p = pieces(m.text.slice(preFrom, start))
    const q = pieces(m.text.slice(end, Math.min(to, end + REACH)))
    return [
      p.length > 0 ? preFrom + p[Math.max(0, p.length - SENTENCES)]![0] : start,
      q.length > 0 ? end + q[Math.min(q.length, SENTENCES) - 1]![1] : end,
    ]
  }
}

/**
 * Reads the neighbours of the [start, end) offsets a finding carries, in the text the search
 * ran on. Neighbours stop at the chapter segment boundary, found by offset rather than label.
 */
export function aroundOf(m: ManuscriptText): (start: number, end: number) => Around {
  const bounds = boundsOf(m)
  return (start, end) => {
    const [from, to] = bounds(start, end)
    return {
      before: paragraphs(m.text.slice(from, start).trimStart()),
      text: m.text.slice(start, end).trim(),
      after: paragraphs(m.text.slice(end, to).trimEnd()),
    }
  }
}

/** Findings whose neighbours overlap, read as one stretch of text. */
export interface Joined {
  /** Indices of the spans it holds, in reading order. */
  spans: number[]
  /** Neighbour text, or a finding's own text with the index of its span. */
  pieces: { text: string; span?: number }[]
}

/**
 * Groups findings whose neighbour sentences overlap so shared text is shown once: each group
 * is the stretch from its first finding's neighbours to its last one's, in reading order.
 */
export function joinOf(m: ManuscriptText): (spans: { start: number; end: number }[]) => Joined[] {
  const bounds = boundsOf(m)
  return (spans) => {
    const order = spans
      .map((s, i) => ({ i, s, b: bounds(s.start, s.end) }))
      .sort((x, y) => x.s.start - y.s.start || x.s.end - y.s.end)
    const groups: { from: number; to: number; items: typeof order }[] = []
    for (const o of order) {
      const g = groups.at(-1)
      if (g && o.b[0] <= g.to) {
        g.to = Math.max(g.to, o.b[1])
        g.items.push(o)
      } else groups.push({ from: o.b[0], to: o.b[1], items: [o] })
    }
    return groups.map(({ from, to, items }) => {
      const out: Joined['pieces'] = []
      let at = from
      const gap = (until: number): void => {
        if (until > at) out.push({ text: m.text.slice(at, until) })
      }
      for (const { i, s } of items) {
        // Its own text without edge spaces; a part already shown by the finding before is skipped.
        const from = Math.max(at, s.start)
        const own = m.text.slice(from, Math.max(from, s.end))
        const start = from + own.length - own.trimStart().length
        const end = start + own.trim().length
        if (end <= start) continue
        gap(start)
        out.push({ text: m.text.slice(start, end), span: i })
        at = end
      }
      gap(to)
      const first = out[0]
      const last = out.at(-1)
      if (first && first.span === undefined) first.text = first.text.trimStart()
      if (last && last.span === undefined) last.text = last.text.trimEnd()
      for (const p of out) if (p.span === undefined) p.text = paragraphs(p.text)
      return {
        spans: items.map((o) => o.i),
        pieces: out.filter((p) => p.text !== ''),
      }
    })
  }
}

/** Keeps line breaks but at most one blank line between paragraphs. */
function paragraphs(t: string): string {
  return t.replace(/\n\s*\n\s*/gu, '\n\n')
}
