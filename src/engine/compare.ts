import {
  MAX_GRID_CELLS,
  MAX_PASSAGES_PER_MATCH,
  MAX_RESULTS,
  PARTIAL_EVERY_MS,
  PROGRESS_EVERY,
  TIER_EDITED,
  TIER_NEAR,
} from '../shared/constants.ts'
import type {
  ChapterMatch,
  ChapterRange,
  CompareResult,
  Grid,
  GridCell,
  ManuscriptText,
  Passage,
  RunStats,
  Tier,
} from '../shared/types.ts'
import { CandidateFinder } from './candidates.ts'
import { commonPhrases, inRange } from './common.ts'
import { similarity } from './editDistance.ts'
import { buildFingerprintIndex } from './fingerprints.ts'
import { indexSentences, type SentenceIndex } from './sentences.ts'

export interface RunOptions {
  rangeA?: ChapterRange
  rangeB?: ChapterRange
  /** Called with 0–1 every PROGRESS_EVERY query sentences. Abort is done by terminating the worker. */
  onProgress?: (pct: number) => void
  /** Called with the findings so far, at most every PARTIAL_EVERY_MS, so the UI can stream them. */
  onPartial?: (result: CompareResult) => void
}

export function tierOf(score: number): Tier {
  return score >= TIER_NEAR ? 'near' : 'edited'
}

/** Matched sentence pair. */
interface Pair {
  i: number
  j: number
  score: number
}

/** One diagonal run of matched pairs: a passage before its text is materialised. */
interface Run {
  i0: number
  j0: number
  i1: number
  j1: number
  sum: number
  len: number
  score: number
}

/** Chapter pair under construction; only the strongest runs keep a slot. */
interface Group {
  a: number | null
  b: number | null
  count: number
  near: number
  top: Run[]
}

export function compare(
  a: ManuscriptText,
  b: ManuscriptText,
  opts: RunOptions = {},
): CompareResult {
  const t0 = performance.now()
  const idxA = indexSentences(a.text, a.chapters)
  const idxB = indexSentences(b.text, b.chapters)
  const includeA = inRange(idxA, opts.rangeA)
  const includeB = inRange(idxB, opts.rangeB)
  const t1 = performance.now()
  const fpA = buildFingerprintIndex(idxA.norm, includeA)
  const fpB = buildFingerprintIndex(idxB.norm, includeB)
  const finder = new CandidateFinder(fpB, idxB.norm.length)
  const t2 = performance.now()

  let queriedA = 0
  let targetsB = 0
  for (let i = 0; i < includeA.length; i++) if (includeA[i]) queriedA++
  for (let j = 0; j < includeB.length; j++) if (includeB[j]) targetsB++

  const stats: RunStats = {
    indexMs: t1 - t0,
    fingerprintMs: t2 - t1,
    scanMs: 0,
    groupMs: 0,
    totalMs: 0,
    chars: a.text.length + b.text.length,
    sentencesA: queriedA,
    sentencesB: targetsB,
    pairsNaive: queriedA * targetsB,
    pairsScored: 0,
  }

  const common = commonPhrases([idxA, idxB])
  const pairs: Pair[] = []
  // ponytail: a snapshot regroups every pair found so far instead of maintaining incremental
  // state; at PARTIAL_EVERY_MS cadence that costs a few percent. Make grouping incremental only
  // if snapshots ever show up in the scan time.
  const snapshot = (): CompareResult => {
    const tg = performance.now()
    const result = buildResult(pairs, idxA, idxB, common, stats)
    stats.groupMs = performance.now() - tg
    return result
  }

  let nextPartial = performance.now() + PARTIAL_EVERY_MS
  let lastEmitted = 0
  const scanStart = performance.now()
  for (let i = 0; i < idxA.norm.length; i++) {
    if (i % PROGRESS_EVERY === 0) {
      opts.onProgress?.(i / idxA.norm.length)
      const now = performance.now()
      if (opts.onPartial && now >= nextPartial && pairs.length > lastEmitted) {
        lastEmitted = pairs.length
        nextPartial = now + PARTIAL_EVERY_MS
        stats.scanMs = now - scanStart
        stats.totalMs = now - t0
        opts.onPartial(snapshot())
      }
    }
    if (!includeA[i]) continue
    const cands = finder.find(fpA, i)
    for (let k = 0; k < cands.length; k += 2) {
      const j = cands[k]!
      stats.pairsScored++
      const score = similarity(idxA.norm[i]!, idxB.norm[j]!, TIER_EDITED)
      if (score > 0) pairs.push({ i, j, score })
    }
  }
  stats.scanMs = performance.now() - scanStart

  const result = snapshot()
  opts.onProgress?.(1)
  // The snapshot copied stats before grouping finished, so the final numbers land on the copy.
  result.stats.groupMs = stats.groupMs
  result.stats.totalMs = performance.now() - t0
  return result
}

function buildResult(
  pairs: Pair[],
  idxA: SentenceIndex,
  idxB: SentenceIndex,
  common: Set<string>,
  stats: RunStats,
): CompareResult {
  const groups = new Map<string, Group>()
  for (const r of chainRuns(pairs, idxB.norm.length + 1)) {
    // A stock phrase matching somewhere else is not a suspicion.
    if (r.len === 1 && common.has(idxA.norm[r.i0]!)) continue
    // Rounded percentage decides the tier, so a 90% passage is never called 일부 수정.
    r.score = Math.round((r.sum / r.len) * 100)
    const ca = idxA.chapter[r.i0]!
    const cb = idxB.chapter[r.j0]!
    const key = `${ca}|${cb}`
    let g = groups.get(key)
    if (!g) {
      g = { a: ca < 0 ? null : ca, b: cb < 0 ? null : cb, count: 0, near: 0, top: [] }
      groups.set(key, g)
    }
    g.count++
    if (r.score >= TIER_NEAR * 100) g.near++
    keepStrongest(g.top, r)
  }

  const list = [...groups.values()]
  list.sort((x, y) => y.near - x.near || y.count - x.count || (x.a ?? 0) - (y.a ?? 0))
  return {
    kind: 'compare',
    total: list.length,
    matches: list.slice(0, MAX_RESULTS).map((g) => toMatch(g, idxA, idxB)),
    grid: buildGrid(list),
    stats: { ...stats },
  }
}

/** Chapter pair densities for the dotplot; null when either side has no chapters. */
function buildGrid(list: Group[]): Grid | null {
  const cells: GridCell[] = []
  for (const g of list) {
    if (g.a === null || g.b === null) continue
    cells.push({ a: g.a, b: g.b, count: g.count, near: g.near })
  }
  if (cells.length === 0) return null
  const truncated = cells.length > MAX_GRID_CELLS
  if (truncated) {
    cells.sort((x, y) => y.count - x.count)
    cells.length = MAX_GRID_CELLS
  }
  let aMin = Infinity
  let aMax = -Infinity
  let bMin = Infinity
  let bMax = -Infinity
  for (const c of cells) {
    if (c.a < aMin) aMin = c.a
    if (c.a > aMax) aMax = c.a
    if (c.b < bMin) bMin = c.b
    if (c.b > bMax) bMax = c.b
  }
  return { cells, aMin, aMax, bMin, bMax, truncated }
}

function toMatch(g: Group, idxA: SentenceIndex, idxB: SentenceIndex): ChapterMatch {
  g.top.sort((x, y) => x.i0 - y.i0)
  return {
    a: g.a,
    b: g.b,
    tier: g.near > 0 ? 'near' : 'edited',
    count: g.count,
    passages: g.top.map((r) => ({
      tier: tierOf(r.score / 100),
      a: span(idxA, r.i0, r.i1),
      b: span(idxB, r.j0, r.j1),
    })),
  }
}

/** Keeps at most MAX_PASSAGES_PER_MATCH runs, dropping the weakest when full. */
function keepStrongest(top: Run[], r: Run): void {
  if (top.length < MAX_PASSAGES_PER_MATCH) {
    top.push(r)
    return
  }
  let worst = 0
  for (let i = 1; i < top.length; i++) if (top[i]!.score < top[worst]!.score) worst = i
  if (r.score > top[worst]!.score) top[worst] = r
}

/** Joins pairs lying on one diagonal ((i,j) after (i-1,j-1)) into runs. */
function chainRuns(pairs: Pair[], stride: number): Run[] {
  pairs.sort((x, y) => x.i - y.i || x.j - y.j)
  const runs: Run[] = []
  const runAt = new Map<number, number>()
  for (const p of pairs) {
    const prev = runAt.get((p.i - 1) * stride + (p.j - 1))
    if (prev === undefined) {
      runAt.set(p.i * stride + p.j, runs.length)
      runs.push({ i0: p.i, j0: p.j, i1: p.i, j1: p.j, sum: p.score, len: 1, score: 0 })
    } else {
      const r = runs[prev]!
      r.i1 = p.i
      r.j1 = p.j
      r.sum += p.score
      r.len++
      runAt.set(p.i * stride + p.j, prev)
    }
  }
  return runs
}

function span(idx: SentenceIndex, from: number, to: number): Passage['a'] {
  const c = idx.chapter[from]!
  return {
    chapter: c < 0 ? null : c,
    sentenceIndex: idx.ordinal[from]!,
    text: idx.text.slice(idx.starts[from], idx.ends[to]).trim(),
  }
}
