import type { joinOf, Joined } from '../engine/context.ts'
import type { PdfBlock, PdfSide } from '../export/pdf.ts'
import type { Passage, Span } from '../shared/types.ts'
import type { FileFn } from './CompareView.tsx'
import { chapterLabel } from './results.ts'

export type JoinFn = ReturnType<typeof joinOf>

const spanKey = (s: Span): string => `${s.start}:${s.end}`
const uniqueSpans = (spans: Span[]): Span[] => [
  ...new Map(spans.map((s) => [spanKey(s), s])).values(),
]
const nth = (spans: Span[]): string =>
  [...new Set(spans.map((s) => s.sentenceIndex))]
    .sort((x, y) => x - y)
    .map((i) => (i + 1).toLocaleString())
    .join('·') + '번째 문장'

/**
 * A chapter pair's findings as the detail pane and the report show them, each text once.
 * Findings whose neighbour sentences overlap are joined into one stretch per side; stretches
 * linked by a finding form a block. In a block's rows each A stretch sits beside a B stretch
 * it matched where it can, and each box names the other side's sentences it matched.
 */
export function blocksOf(
  ps: Passage[],
  joinA: JoinFn,
  joinB: JoinFn,
  fileA: FileFn,
  fileB: FileFn,
): PdfBlock[] {
  const spansA = uniqueSpans(ps.map((p) => p.a))
  const spansB = uniqueSpans(ps.map((p) => p.b))
  const ja = joinA(spansA)
  const jb = joinB(spansB)
  const stretch = (joined: Joined[], spans: Span[]): Map<string, number> =>
    new Map(joined.flatMap((j, g) => j.spans.map((i) => [spanKey(spans[i]!), g] as const)))
  const inA = stretch(ja, spansA)
  const inB = stretch(jb, spansB)
  const aOf = (p: Passage): number => inA.get(spanKey(p.a))!
  const bOf = (p: Passage): number => inB.get(spanKey(p.b))!

  // A finding matched in several places is marked against the first of them.
  const side = (key: 'A' | 'B', file: FileFn, spans: Span[], j: Joined, g: number): PdfSide => {
    const own = j.spans.map((i) => spans[i]!)
    const mine = ps.filter((p) => (key === 'A' ? aOf(p) : bOf(p)) === g)
    const match = (s: Span): string => {
      const p = mine.find((q) => spanKey(key === 'A' ? q.a : q.b) === spanKey(s))!
      return key === 'A' ? p.b.text : p.a.text
    }
    return {
      label: `${file(own[0]!.start)} · ${chapterLabel(own[0]!.chapter)} · ${nth(own)}`,
      link: `↔ ${key === 'A' ? 'B' : 'A'} ${nth(mine.map((p) => (key === 'A' ? p.b : p.a)))}`,
      pieces: j.pieces.map((p) =>
        p.span === undefined ? { text: p.text } : { text: p.text, other: match(spans[p.span]!) },
      ),
    }
  }

  // Stretches linked through findings share a block: A stretch g is node g, B stretch g is |A|+g.
  const parent = Array.from({ length: ja.length + jb.length }, (_, i) => i)
  const root = (x: number): number => (parent[x] === x ? x : (parent[x] = root(parent[x]!)))
  for (const p of ps) parent[root(aOf(p))] = root(ja.length + bOf(p))
  // Each B stretch sits beside the first A stretch it matched, whatever its own position in B;
  // more B stretches for one A stretch follow in rows of their own.
  const firstA = jb.map((_, g) => Math.min(...ps.filter((p) => bOf(p) === g).map(aOf)))
  const blocks = new Map<number, PdfBlock>()
  ja.forEach((j, g) => {
    const r = root(g)
    if (!blocks.has(r)) blocks.set(r, [])
    const rows = blocks.get(r)!
    const bs = jb.flatMap((_, h) => (firstA[h] === g ? [h] : []))
    rows.push({
      a: side('A', fileA, spansA, j, g),
      b: bs[0] === undefined ? null : side('B', fileB, spansB, jb[bs[0]]!, bs[0]),
    })
    for (const h of bs.slice(1)) rows.push({ a: null, b: side('B', fileB, spansB, jb[h]!, h) })
  })
  return [...blocks.values()]
}
