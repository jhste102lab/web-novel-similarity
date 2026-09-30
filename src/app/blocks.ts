import type { joinOf, Joined } from '../engine/context.ts'
import type { PdfBlock, PdfSide } from '../export/pdf.ts'
import type { Passage, Span } from '../shared/types.ts'
import { chapterLabel, type FileFn } from './results.ts'

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
 * A chapter pair's findings as the detail pane and the report show them: one block per A
 * stretch (findings whose neighbour sentences overlap, joined) in A's reading order, with every
 * B stretch it matched stacked beside it, whole. B stretches are joined within a block only, so
 * a B passage matching two A stretches far apart is shown in full beside each.
 */
export function blocksOf(
  ps: Passage[],
  joinA: JoinFn,
  joinB: JoinFn,
  fileA: FileFn,
  fileB: FileFn,
): PdfBlock[] {
  /** One stretch whole: its label, the other side's sentences it matched, its marked text. */
  const side = (key: 'A' | 'B', j: Joined, spans: Span[], mine: Passage[]): PdfSide => {
    const own = (p: Passage): Span => (key === 'A' ? p.a : p.b)
    const other = (p: Passage): Span => (key === 'A' ? p.b : p.a)
    const held = j.spans.map((i) => spans[i]!)
    const inside = new Set(held.map(spanKey))
    const linked = mine.filter((p) => inside.has(spanKey(own(p))))
    // A finding matched twice is marked against the first.
    const match = (s: Span): string =>
      other(linked.find((p) => spanKey(own(p)) === spanKey(s))!).text
    return {
      label: `${(key === 'A' ? fileA : fileB)(held[0]!.start)} · ${chapterLabel(held[0]!.chapter)} · ${nth(held)}`,
      link: `↔ ${key === 'A' ? 'B' : 'A'} ${nth(linked.map(other))}`,
      pieces: j.pieces.map((p) =>
        p.span === undefined ? { text: p.text } : { text: p.text, other: match(spans[p.span]!) },
      ),
    }
  }
  const spansA = uniqueSpans(ps.map((p) => p.a))
  return joinA(spansA).map((ja) => {
    const inA = new Set(ja.spans.map((i) => spanKey(spansA[i]!)))
    const mine = ps.filter((p) => inA.has(spanKey(p.a)))
    const spansB = uniqueSpans(mine.map((p) => p.b))
    return {
      a: side('A', ja, spansA, mine),
      b: joinB(spansB).map((jb) => side('B', jb, spansB, mine)),
    }
  })
}
