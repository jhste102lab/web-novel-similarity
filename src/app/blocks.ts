import type { joinOf, Joined } from '../engine/context.ts'
import type { PdfBlock, PdfPiece, PdfSide } from '../export/pdf.ts'
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
 * A chapter pair's findings as the detail pane and the report show them. Findings whose
 * neighbour sentences overlap are joined into one stretch per side; stretches linked by a
 * finding form a block. Each row of a block is one linked A stretch and B stretch, so every
 * box stands beside what it matched. A stretch's text is shown in full the first time only;
 * later rows show just its sentences that match the other box, as a reference.
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
  const own = (key: 'A' | 'B', p: Passage): Span => (key === 'A' ? p.a : p.b)
  const other = (key: 'A' | 'B', p: Passage): Span => (key === 'A' ? p.b : p.a)
  const label = (key: 'A' | 'B', spans: Span[]): string =>
    `${(key === 'A' ? fileA : fileB)(spans[0]!.start)} · ${chapterLabel(spans[0]!.chapter)} · ${nth(spans)}`

  /** The whole stretch with its neighbours; a finding matched twice is marked against the first. */
  const full = (key: 'A' | 'B', g: number): PdfSide => {
    const [j, spans] = key === 'A' ? [ja[g]!, spansA] : [jb[g]!, spansB]
    const mine = ps.filter((p) => (key === 'A' ? aOf(p) : bOf(p)) === g)
    const match = (s: Span): string =>
      other(
        key,
        mine.find((p) => spanKey(own(key, p)) === spanKey(s))!,
      ).text
    return {
      label: label(
        key,
        j.spans.map((i) => spans[i]!),
      ),
      link: `↔ ${key === 'A' ? 'B' : 'A'} ${nth(mine.map((p) => other(key, p)))}`,
      pieces: j.pieces.map((p) =>
        p.span === undefined ? { text: p.text } : { text: p.text, other: match(spans[p.span]!) },
      ),
    }
  }
  /** A stretch already shown: only its sentences matching this row's other box. */
  const ref = (key: 'A' | 'B', row: Passage[]): PdfSide => {
    const seen = new Map(row.map((p) => [spanKey(own(key, p)), p]))
    const pieces: PdfPiece[] = [...seen.values()]
      .sort((x, y) => own(key, x).start - own(key, y).start)
      .flatMap((p, i) => [
        ...(i > 0 ? [{ text: '\n' }] : []),
        { text: own(key, p).text.trim(), other: other(key, p).text },
      ])
    return {
      label: label(
        key,
        row.map((p) => own(key, p)),
      ),
      link: '↑ 위에 나온 칸 · 겹친 문장만',
      pieces,
    }
  }

  // Stretches linked through findings share a block: A stretch g is node g, B stretch g is |A|+g.
  const parent = Array.from({ length: ja.length + jb.length }, (_, i) => i)
  const root = (x: number): number => (parent[x] === x ? x : (parent[x] = root(parent[x]!)))
  for (const p of ps) parent[root(aOf(p))] = root(ja.length + bOf(p))
  // One row per linked pair of stretches, in A's reading order, then B's.
  const links = new Map<string, Passage[]>()
  for (const p of [...ps].sort((x, y) => aOf(x) - aOf(y) || bOf(x) - bOf(y))) {
    const k = `${aOf(p)}:${bOf(p)}`
    if (!links.has(k)) links.set(k, [])
    links.get(k)!.push(p)
  }
  const shownA = new Set<number>()
  const shownB = new Set<number>()
  const blocks = new Map<number, PdfBlock>()
  for (const row of links.values()) {
    const a = aOf(row[0]!)
    const b = bOf(row[0]!)
    const r = root(a)
    if (!blocks.has(r)) blocks.set(r, [])
    blocks.get(r)!.push({
      a: shownA.has(a) ? ref('A', row) : full('A', a),
      b: shownB.has(b) ? ref('B', row) : full('B', b),
    })
    shownA.add(a)
    shownB.add(b)
  }
  return [...blocks.values()]
}
